import { describe, expect, it } from "vitest";
import { createExecutionTask } from "@/domain/execution/task";
import { fixedClock } from "@/lib/architecture/clock";
import {
  TriggerEngine,
  createReEntryPlan,
  getBestNowTask,
  getWaitingFollowUps,
} from "@/engines/trigger";
import type { ExecutionTask } from "@/domain/execution/task";

const now = Date.parse("2026-08-14T09:00:00.000Z");
const context = { now, timezone: "Europe/Istanbul", availableSlotMinutes: 30 } as const;
function task(id: string, patch: Partial<ExecutionTask> = {}): ExecutionTask {
  return { ...createExecutionTask({ id, title: id, state: "READY" }, fixedClock(now)), ...patch };
}

describe("deterministic Trigger Engine", () => {
  const engine = new TriggerEngine();
  it("excludes inbox, waiting, blocked, someday and future tasks without inventing capacity", () => {
    const tasks = [
      task("ready"),
      task("inbox", { state: "INBOX" }),
      task("waiting", { state: "WAITING", followUpAt: now - 1 }),
      task("future", { startAt: now + 60_000 }),
    ];
    const results = engine.evaluateTasks(tasks, context);
    expect(results.evaluations.find((item) => item.taskId === "ready")?.eligible).toBe(true);
    expect(results.evaluations.filter((item) => item.eligible)).toHaveLength(1);
    expect(results.signals.find((signal) => signal.id === "T15")?.status).toBe("NOT_EVALUATED");
  });
  it("scores deadlines progressively and explains contributions", () => {
    const results = engine.evaluateTasks(
      [
        task("today", { dueAt: now + 4 * 3_600_000 }),
        task("week", { dueAt: now + 6 * 86_400_000 }),
      ],
      context,
    );
    const today = results.evaluations.find((item) => item.taskId === "today")!;
    const week = results.evaluations.find((item) => item.taskId === "week")!;
    expect(today.score).toBeGreaterThan(week.score);
    expect(today.reasons.some((reason) => reason.code === "DEADLINE_HOURS")).toBe(true);
    expect(today.reasons.every((reason) => Number.isFinite(reason.contribution))).toBe(true);
  });
  it("emits due waiting follow-ups without making WAITING an NOW candidate", () => {
    const waiting = task("reply", { state: "WAITING", followUpAt: now - 1 });
    const results = engine.evaluateTasks([waiting], context);
    expect(getWaitingFollowUps([waiting], context)).toEqual([waiting]);
    expect(
      results.signals.some((signal) => signal.id === "T11" && signal.status === "TRIGGERED"),
    ).toBe(true);
    expect(getBestNowTask([waiting], context, results)).toBeUndefined();
  });
  it("respects dependencies, slots, snooze pressure and stable tie breaking", () => {
    const dependency = task("dependency", { state: "READY" });
    const blocked = task("blocked", { blockedBy: [{ taskId: dependency.id }], state: "READY" });
    const fast = task("fast", { estimatedMinutes: 15, snoozeCount: 4 });
    const results = engine.evaluateTasks([blocked, dependency, fast], context);
    expect(results.evaluations.find((item) => item.taskId === "blocked")?.eligible).toBe(false);
    expect(
      results.evaluations
        .find((item) => item.taskId === "fast")
        ?.reasons.some((r) => r.code === "FITS_SLOT"),
    ).toBe(true);
    expect(getBestNowTask([blocked, dependency, fast], context, results)?.id).toBe("fast");
  });
  it("keeps missing T15-T19 context explicit and creates a bounded re-entry plan", () => {
    const tasks = [
      task("a", { dueAt: now + 2 * 3_600_000 }),
      task("b", { state: "WAITING", followUpAt: now - 1 }),
      task("c", { estimatedMinutes: 10 }),
    ];
    const results = engine.evaluateTasks(tasks, context);
    expect(
      results.signals
        .filter((signal) => ["T15", "T16", "T17", "T18", "T19"].includes(signal.id))
        .every((signal) => signal.status === "NOT_EVALUATED"),
    ).toBe(true);
    const plan = createReEntryPlan(tasks, context, results);
    expect(plan.taskIds.length).toBeLessThanOrEqual(3);
    expect(new Set(plan.taskIds).size).toBe(plan.taskIds.length);
    expect(plan.waitingFollowUpIds).toContain("b");
  });
  it("evaluates a large deterministic set without persistence or mutation", () => {
    const tasks = Array.from({ length: 5000 }, (_, index) =>
      task(`task-${index}`, { createdAt: now - index }),
    );
    const before = JSON.stringify(tasks[0]);
    const results = engine.evaluateTasks(tasks, context);
    expect(results.evaluations).toHaveLength(5000);
    expect(JSON.stringify(tasks[0])).toBe(before);
  }, 15_000);
});
