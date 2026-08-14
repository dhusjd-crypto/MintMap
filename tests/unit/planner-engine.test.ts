import { describe, expect, it } from "vitest";
import {
  plannerEngine,
  chunkTask,
  calculateAvailableMinutesBefore,
  replanDay,
  DEFAULT_PLANNING_CONFIG,
} from "@/engines/planner";
import { createPlannerQueries } from "@/application/queries/planner-queries";
import { TriggerEngine } from "@/engines/trigger";
import { createExecutionTask } from "@/domain/execution/task";
import { fixedClock } from "@/lib/architecture/clock";
import type { PlanningCandidate, PlanningWindow, TimeBlock } from "@/domain/planning";

const now = Date.parse("2026-08-14T09:00:00.000Z");
const window = (id: string, start: number, end: number): PlanningWindow => ({
  id,
  startAt: start,
  endAt: end,
  type: "NORMAL",
  source: "MANUAL",
});
const candidate = (
  id: string,
  estimatedMinutes?: number,
  priorityScore = 0,
  patch: Partial<PlanningCandidate["task"]> = {},
): PlanningCandidate => ({
  task: { id, estimatedMinutes, splittable: false, state: "READY", createdAt: now, ...patch },
  priorityScore,
  priorityReasons: [{ code: "TEST" }],
});

describe("deterministic Planner and capacity engine", () => {
  it("requires explicit windows and never invents a workday", () => {
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [],
      candidates: [candidate("a", 30)],
    });
    expect(result.capacity.availableMinutes).toBe(0);
    expect(result.unscheduled[0]?.reasonCode).toBe("DOES_NOT_FIT");
  });
  it("does not guess missing estimates", () => {
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 60 * 60_000)],
      candidates: [candidate("unknown")],
    });
    expect(result.unscheduled).toEqual([
      {
        taskId: "unknown",
        reasonCode: "ESTIMATE_REQUIRED",
        message: "Planlamak için tahmini süre gerekli.",
      },
    ]);
  });
  it("schedules a non-splittable task only when one complete window fits", () => {
    const input = {
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 45 * 60_000)],
      candidates: [candidate("large", 90)],
    };
    expect(plannerEngine.planDay(input).unscheduled[0]?.reasonCode).toBe("DOES_NOT_FIT");
    expect(
      plannerEngine.planDay({ ...input, windows: [window("w", now, now + 90 * 60_000)] })
        .scheduled[0]?.allocatedMinutes,
    ).toBe(90);
  });
  it("splits work without invalid remainders", () => {
    expect(
      chunkTask({
        remainingMinutes: 70,
        splittable: true,
        minChunkMinutes: 30,
        maxChunkMinutes: 45,
        availableSegmentMinutes: [45, 35],
      }).chunks,
    ).toEqual([35, 35]);
    expect(
      chunkTask({
        remainingMinutes: 25,
        splittable: true,
        minChunkMinutes: 30,
        availableSegmentMinutes: [45],
      }).chunks,
    ).toEqual([]);
  });
  it("uses supplied trigger priority and stable task-id tie breaking", () => {
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 60 * 60_000)],
      candidates: [candidate("z", 30, 10), candidate("a", 30, 10)],
    });
    expect(result.scheduled[0]?.taskId).toBe("a");
  });
  it("reserves fixed events and calculates buffers and overcommit structurally", () => {
    const fixed: TimeBlock = {
      id: "meeting",
      type: "FIXED_EVENT",
      startAt: now + 30 * 60_000,
      endAt: now + 60 * 60_000,
      durationMinutes: 30,
      status: "PLANNED",
      lockState: "LOCKED",
      source: "MANUAL",
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 120 * 60_000)],
      fixedBlocks: [fixed],
      candidates: [candidate("a", 100)],
    });
    expect(result.capacity.fixedMinutes).toBe(30);
    expect(result.dailyPlan.timeBlocks.some((block) => block.id === "meeting")).toBe(true);
    expect(result.capacity.plannedTaskMinutes).toBeLessThanOrEqual(90);
  });
  it("calculates deadline risk only from explicit future windows", () => {
    const due = now + 90 * 60_000;
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 30 * 60_000)],
      candidates: [candidate("risk", 60, 10, { dueAt: due })],
    });
    expect(result.capacity.tasksAtRisk[0]).toMatchObject({
      taskId: "risk",
      requiredMinutes: 60,
      deficitMinutes: 33,
    });
    expect(
      calculateAvailableMinutesBefore(
        due,
        [window("w", now, now + 30 * 60_000)],
        [],
        DEFAULT_PLANNING_CONFIG,
        now,
      ),
    ).toBe(27);
  });
  it("preserves completed block semantics without marking the task done", () => {
    const completed: TimeBlock = {
      id: "done-part",
      taskId: "task",
      type: "TASK",
      startAt: now,
      endAt: now + 30 * 60_000,
      durationMinutes: 30,
      status: "COMPLETED",
      lockState: "LOCKED",
      source: "MANUAL",
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now + 30 * 60_000, now + 90 * 60_000)],
      existingBlocks: [completed],
      candidates: [candidate("task", 60)],
    });
    expect(result.scheduled[0]?.allocatedMinutes).toBe(60);
    expect(result.dailyPlan.timeBlocks.find((block) => block.id === "done-part")?.status).toBe(
      "COMPLETED",
    );
  });
  it("keeps existing blocks stable during replan and returns a diff", () => {
    const previous = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 60 * 60_000)],
      candidates: [candidate("stable", 30, 10)],
    }).dailyPlan;
    const next = replanDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 60 * 60_000)],
      existingBlocks: previous.timeBlocks,
      previousPlan: previous,
      candidates: [candidate("stable", 30, 10)],
    });
    expect(next.diff.preservedBlockIds).toContain(previous.timeBlocks[0]?.id);
    expect(next.diff.movedBlockIds).toHaveLength(0);
  });
  it("releases flexible task blocks that fall outside new planning windows", () => {
    const previous = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("old", now + 4 * 60 * 60_000, now + 5 * 60 * 60_000)],
      candidates: [candidate("move", 30, 10)],
    }).dailyPlan;
    const next = replanDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("new", now + 6 * 60 * 60_000, now + 7 * 60 * 60_000)],
      existingBlocks: previous.timeBlocks,
      previousPlan: previous,
      candidates: [candidate("move", 30, 10)],
    });
    expect(next.diff.removedBlockIds).toContain(previous.timeBlocks[0]?.id);
    expect(next.diff.addedBlockIds).toHaveLength(1);
    expect(next.result.dailyPlan.timeBlocks[0]?.startAt).toBe(now + 6 * 60 * 60_000);
  });
  it("does not mutate task truth or create child tasks for chunks", () => {
    const original = candidate("one", 90, 5, { dueAt: now + 2 * 60 * 60_000 });
    const dueAt = original.task.dueAt;
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [
        window("w", now, now + 30 * 60_000),
        window("w2", now + 30 * 60_000, now + 90 * 60_000),
      ],
      candidates: [
        { ...original, task: { ...original.task, splittable: true, minChunkMinutes: 30 } },
      ],
    });
    expect(original.task.dueAt).toBe(dueAt);
    expect(result.dailyPlan.timeBlocks.every((block) => block.taskId === "one")).toBe(true);
  });
  it("activates T15, T16 and T19 only through Planner application context", () => {
    const result = plannerEngine.planDay({
      now,
      timezone: "Europe/Istanbul",
      localDate: "2026-08-14",
      windows: [window("w", now, now + 30 * 60_000)],
      candidates: [candidate("risk", 60, 10, { dueAt: now + 90 * 60_000 })],
    });
    const context = createPlannerQueries().toTriggerContext(result, {
      now,
      timezone: "Europe/Istanbul",
    });
    const signals = new TriggerEngine().evaluateTasks([], context).signals;
    expect(signals.find((signal) => signal.id === "T15")?.status).toBe("NOT_TRIGGERED");
    expect(signals.find((signal) => signal.id === "T19")?.status).toBe("NOT_TRIGGERED");
    const taskSignals = new TriggerEngine().evaluateTasks(
      [
        createExecutionTask(
          {
            id: "risk",
            title: "risk",
            state: "READY",
            dueAt: now + 90 * 60_000,
            estimatedMinutes: 60,
          },
          fixedClock(now),
        ),
      ],
      context,
    ).signals;
    expect(taskSignals.some((signal) => signal.id === "T16" && signal.status === "TRIGGERED")).toBe(
      true,
    );
  });
});
