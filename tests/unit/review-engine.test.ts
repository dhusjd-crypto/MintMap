import { describe, expect, it } from "vitest";
import { createReviewEngine, isRoutineDue } from "@/engines/review";
import type { ExecutionTask } from "@/domain/execution/task";

const task = (id: string, extra: Partial<ExecutionTask> = {}): ExecutionTask => ({
  id,
  title: id,
  state: "READY",
  createdAt: 0,
  updatedAt: 0,
  lastTouchedAt: 0,
  snoozeCount: 0,
  blockedBy: [],
  blocks: [],
  notificationPolicy: "NORMAL",
  notificationCount: 0,
  ...extra,
});

describe("Routine / Review Engine", () => {
  const now = Date.parse("2026-08-14T08:00:00Z");
  it("evaluates a routine once per local date and uses configured windows", () => {
    expect(isRoutineDue("MORNING_PLANNING", now, "Europe/Istanbul")).toBe(true);
    expect(
      isRoutineDue("MORNING_PLANNING", now, "Europe/Istanbul", {
        localDate: "2026-08-14",
        status: "COMPLETED",
      } as never),
    ).toBe(false);
  });
  it("keeps leftovers distinct from hard deadlines and warns on overcommit", () => {
    const engine = createReviewEngine();
    const yesterday = now - 86_400_000;
    const result = engine.getMorning(
      [task("leftover", { doAt: yesterday }), task("deadline", { dueAt: now + 2 * 86_400_000 })],
      now,
      "Europe/Istanbul",
      {
        availableMinutes: 60,
        plannedTaskMinutes: 90,
        remainingMinutes: -30,
        overcommitMinutes: 30,
      },
    );
    expect(result.leftovers.map((item) => item.id)).toEqual(["leftover"]);
    expect(result.deadlineRisks.map((item) => item.id)).toEqual(["deadline"]);
    expect(result.warnings).toHaveLength(1);
  });
  it("limits re-entry to a small actionable set", () => {
    const engine = createReviewEngine({ reentryInactivityThresholdDays: 3 } as never);
    const result = engine.getReentry(
      Array.from({ length: 12 }, (_, index) => task(`task-${index}`)),
      now,
      "Europe/Istanbul",
    );
    expect(result.primaryItems).toHaveLength(3);
    expect(result.secondaryItems.length).toBeLessThanOrEqual(2);
  });
});
