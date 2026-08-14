import type {
  DeadlinePlanningRisk,
  PlanningConfig,
  PlanningWindow,
  TimeBlock,
  PlanningCandidate,
} from "@/domain/planning";
import { mergeWindows, subtractBlocks, totalMinutes } from "./windows";
import { bufferMinutes } from "./capacity";

export function calculateAvailableMinutesBefore(
  dueAt: number,
  windows: readonly PlanningWindow[],
  blocks: readonly TimeBlock[],
  config: PlanningConfig,
  now: number,
): number {
  const bounded = windows
    .map((window) => ({
      ...window,
      startAt: Math.max(window.startAt, now),
      endAt: Math.min(window.endAt, dueAt),
    }))
    .filter((window) => window.endAt > window.startAt);
  const base = mergeWindows(bounded).segments;
  const free = subtractBlocks(base, blocks);
  return Math.max(0, totalMinutes(free) - bufferMinutes(totalMinutes(free), config));
}
export function calculateDeadlineRisk(
  candidate: PlanningCandidate,
  windows: readonly PlanningWindow[],
  blocks: readonly TimeBlock[],
  config: PlanningConfig,
  now: number,
  completedMinutes = 0,
): DeadlinePlanningRisk | undefined {
  if (candidate.task.dueAt === undefined || candidate.task.estimatedMinutes === undefined)
    return undefined;
  const requiredMinutes = Math.max(0, candidate.task.estimatedMinutes - completedMinutes);
  const availableMinutes = calculateAvailableMinutesBefore(
    candidate.task.dueAt,
    windows,
    blocks,
    config,
    now,
  );
  const deficitMinutes = Math.max(0, requiredMinutes - availableMinutes);
  if (!deficitMinutes) return undefined;
  return {
    taskId: candidate.task.id,
    dueAt: candidate.task.dueAt,
    requiredMinutes,
    availableMinutes,
    deficitMinutes,
    severity:
      deficitMinutes >= requiredMinutes ? "CRITICAL" : deficitMinutes >= 30 ? "HIGH" : "ATTENTION",
  };
}
