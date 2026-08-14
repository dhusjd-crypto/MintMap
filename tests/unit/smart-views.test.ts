import { describe, expect, it } from "vitest";
import { getSmartView } from "@/application/smart-views";
import type { ExecutionTask } from "@/domain/execution/task";

const now = Date.parse("2026-08-14T12:00:00Z");
function task(id: string, patch: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id,
    title: id,
    state: "READY",
    createdAt: now - 10_000,
    updatedAt: now - 10_000,
    lastTouchedAt: now - 10_000,
    snoozeCount: 0,
    notificationCount: 0,
    notificationPolicy: "NORMAL",
    blockedBy: [],
    blocks: [],
    metadata: {},
    estimatedMinutes: 20,
    ...patch,
  };
}

describe("smart views", () => {
  it("keeps completed history separate from active views", () => {
    const completed = task("completed", { state: "DONE", completedAt: now - 1 });
    expect(
      getSmartView({ viewId: "completed", tasks: [completed], now, timezone: "UTC" }).items.map(
        (item) => item.entityId,
      ),
    ).toEqual(["completed"]);
    expect(getSmartView({ viewId: "now", tasks: [completed], now, timezone: "UTC" }).items).toEqual(
      [],
    );
  });
  it("keeps blocked and blocking direction distinct", () => {
    const blocker = task("a", { blocks: [{ taskId: "b" }] });
    const blocked = task("b", { state: "BLOCKED", blockedBy: [{ taskId: "a" }] });
    expect(
      getSmartView({
        viewId: "blocking",
        tasks: [blocker, blocked],
        now,
        timezone: "UTC",
      }).items.map((item) => item.entityId),
    ).toEqual(["a"]);
    expect(
      getSmartView({
        viewId: "blocked",
        tasks: [blocker, blocked],
        now,
        timezone: "UTC",
      }).items.map((item) => item.entityId),
    ).toEqual(["b"]);
  });
  it("uses explicit context and energy fields", () => {
    const quick = task("quick", {
      estimatedMinutes: 10,
      context: "OFFICE",
      energyRequirement: "LOW",
    });
    const deep = task("deep", { estimatedMinutes: 45, energyRequirement: "HIGH" });
    expect(
      getSmartView({
        viewId: "quick-wins",
        tasks: [quick, deep],
        now,
        timezone: "UTC",
        availableSlotMinutes: 15,
      }).items.map((item) => item.entityId),
    ).toEqual(["quick"]);
    expect(
      getSmartView({ viewId: "office", tasks: [quick, deep], now, timezone: "UTC" }).items.map(
        (item) => item.entityId,
      ),
    ).toEqual(["quick"]);
    expect(
      getSmartView({ viewId: "deep-work", tasks: [quick, deep], now, timezone: "UTC" }).items.map(
        (item) => item.entityId,
      ),
    ).toEqual(["deep"]);
  });
});
