import type {
  PlanningCandidate,
  PlanningConfig,
  PlanningWindow,
  ScheduledAllocation,
  TimeBlock,
  UnscheduledTask,
} from "@/domain/planning";
import { chunkTask } from "./chunking";
import { PLANNER_REASON_CODES } from "./reasons";
import { durationMinutes, mergeWindows, subtractBlocks, type Segment } from "./windows";

function compareCandidates(a: PlanningCandidate, b: PlanningCandidate) {
  return (
    b.priorityScore - a.priorityScore ||
    (a.task.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.task.dueAt ?? Number.MAX_SAFE_INTEGER) ||
    (a.task.doAt === undefined ? 1 : 0) - (b.task.doAt === undefined ? 1 : 0) ||
    (a.task.estimatedMinutes ?? Number.MAX_SAFE_INTEGER) -
      (b.task.estimatedMinutes ?? Number.MAX_SAFE_INTEGER) ||
    a.task.id.localeCompare(b.task.id)
  );
}
function intersecting(block: TimeBlock, segments: readonly Segment[]) {
  return segments.some(
    (segment) => block.startAt >= segment.startAt && block.endAt <= segment.endAt,
  );
}
function blockId(taskId: string, startAt: number, index: number) {
  return `plan:${taskId}:${startAt}:${index}`;
}
export function scheduleCandidates(input: {
  now: number;
  candidates: readonly PlanningCandidate[];
  windows: readonly PlanningWindow[];
  existingBlocks: readonly TimeBlock[];
  fixedBlocks: readonly TimeBlock[];
  config: PlanningConfig;
}): { blocks: TimeBlock[]; scheduled: ScheduledAllocation[]; unscheduled: UnscheduledTask[] } {
  const baseWindows = mergeWindows(input.windows).segments;
  const occupied = [...input.existingBlocks, ...input.fixedBlocks].filter(
    (block, index, all) =>
      all.findIndex((other) => other.id === block.id) === index && block.status !== "CANCELLED",
  );
  const blocks = [...occupied];
  const scheduled: ScheduledAllocation[] = [];
  const unscheduled: UnscheduledTask[] = [];
  for (const candidate of [...input.candidates].sort(compareCandidates)) {
    if (
      candidate.task.state === "DONE" ||
      candidate.task.state === "CANCELLED" ||
      candidate.task.state === "WAITING" ||
      candidate.task.state === "BLOCKED" ||
      (candidate.task.startAt !== undefined && candidate.task.startAt > input.now)
    )
      continue;
    const existing = blocks.filter(
      (block) => block.taskId === candidate.task.id && block.status !== "CANCELLED",
    );
    const completed = existing
      .filter((block) => block.status === "COMPLETED")
      .reduce((sum, block) => sum + block.durationMinutes, 0);
    const allocated = existing
      .filter((block) => block.status !== "COMPLETED")
      .reduce((sum, block) => sum + block.durationMinutes, 0);
    if (candidate.task.estimatedMinutes === undefined) {
      unscheduled.push({
        taskId: candidate.task.id,
        reasonCode: PLANNER_REASON_CODES.ESTIMATE_REQUIRED,
        message: "Planlamak için tahmini süre gerekli.",
      });
      continue;
    }
    const remaining = Math.max(0, candidate.task.estimatedMinutes - completed - allocated);
    if (remaining === 0) {
      scheduled.push({
        taskId: candidate.task.id,
        blockIds: existing.map((block) => block.id),
        allocatedMinutes: completed + allocated,
        reasonCodes: [PLANNER_REASON_CODES.PRESERVED_EXISTING_BLOCK],
      });
      continue;
    }
    const free = subtractBlocks(baseWindows, blocks);
    const available = free.map(durationMinutes);
    const chunks = chunkTask({
      remainingMinutes: remaining,
      splittable: candidate.task.splittable,
      minChunkMinutes: candidate.task.minChunkMinutes,
      maxChunkMinutes: candidate.task.maxChunkMinutes,
      availableSegmentMinutes: available,
    });
    if (!chunks.chunks.length) {
      unscheduled.push({
        taskId: candidate.task.id,
        reasonCode: chunks.reasonCode ?? PLANNER_REASON_CODES.UNSCHEDULED_NO_FIT,
        message: candidate.task.splittable
          ? "Geçerli parçalara ayrılabilecek pencere yok."
          : "Görev tek parça olarak uygun pencereye sığmıyor.",
      });
      continue;
    }
    const created: TimeBlock[] = [];
    let segments = free;
    let segmentIndex = 0;
    for (const [index, minutes] of chunks.chunks.entries()) {
      while (segments[segmentIndex] && durationMinutes(segments[segmentIndex]) < minutes)
        segmentIndex++;
      const segment = segments[segmentIndex];
      if (!segment) break;
      const startAt = Math.max(segment.startAt, candidate.task.startAt ?? segment.startAt);
      const endAt = startAt + minutes * 60_000;
      const block: TimeBlock = {
        id: blockId(candidate.task.id, startAt, index),
        taskId: candidate.task.id,
        type: "TASK",
        startAt,
        endAt,
        durationMinutes: minutes,
        status: "PLANNED",
        lockState: candidate.manualLocked ? "LOCKED" : "UNLOCKED",
        source: "PLANNER",
        createdAt: input.now,
        updatedAt: input.now,
        metadata: {
          priorityScore: candidate.priorityScore,
          priorityReasons: candidate.priorityReasons,
        },
      };
      created.push(block);
      blocks.push(block);
      const leftover = { startAt: endAt, endAt: segment.endAt };
      segments = [
        ...segments.slice(0, segmentIndex),
        ...(leftover.endAt > leftover.startAt ? [leftover] : []),
        ...segments.slice(segmentIndex + 1),
      ];
    }
    if (created.reduce((sum, block) => sum + block.durationMinutes, 0) !== remaining) {
      for (const block of created)
        blocks.splice(
          blocks.findIndex((item) => item.id === block.id),
          1,
        );
      unscheduled.push({
        taskId: candidate.task.id,
        reasonCode: PLANNER_REASON_CODES.UNSCHEDULED_NO_FIT,
        message: "Parçaların tamamı uygun pencerelere yerleştirilemedi.",
      });
      continue;
    }
    scheduled.push({
      taskId: candidate.task.id,
      blockIds: [...existing.map((block) => block.id), ...created.map((block) => block.id)],
      allocatedMinutes: completed + allocated + remaining,
      reasonCodes: [
        candidate.priorityScore > 0
          ? PLANNER_REASON_CODES.HIGH_PRIORITY
          : PLANNER_REASON_CODES.CHUNK_FIT,
        ...(candidate.task.dueAt ? [PLANNER_REASON_CODES.HARD_DEADLINE_FIT] : []),
        ...(created.length === 1
          ? [PLANNER_REASON_CODES.EXACT_WINDOW_FIT]
          : [PLANNER_REASON_CODES.CHUNK_FIT]),
      ],
    });
  }
  return { blocks, scheduled, unscheduled };
}
