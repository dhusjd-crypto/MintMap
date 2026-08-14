import { describe, expect, it } from "vitest";
import { createCommandCenterV2Application } from "@/application/command-center-v2";
import type { ExecutionTask } from "@/domain/execution/task";
import type { PlanResult } from "@/domain/planning";

const now = Date.parse("2026-08-15T08:00:00Z");
function task(id: string, patch: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    id,
    title: id,
    state: "READY",
    createdAt: now - 1,
    updatedAt: now - 1,
    lastTouchedAt: now - 1,
    snoozeCount: 0,
    notificationCount: 0,
    notificationPolicy: "NORMAL",
    blockedBy: [],
    blocks: [],
    metadata: {},
    estimatedMinutes: 30,
    ...patch,
  };
}
const plan = {
  dailyPlan: {
    id: "plan",
    localDate: "2026-08-15",
    timezone: "UTC",
    timeBlocks: [],
    createdAt: now,
    updatedAt: now,
    status: "ACTIVE",
    revision: 2,
  },
  capacity: {
    availableMinutes: 180,
    fixedMinutes: 0,
    bufferMinutes: 0,
    plannedTaskMinutes: 240,
    remainingMinutes: -60,
    overcommitMinutes: 60,
    tasksAtRisk: [],
    warnings: [],
  },
  overcommit: { overcommitMinutes: 60, movableTaskIds: [], reason: "OVERCOMMITTED" },
  scheduled: [],
  unscheduled: [],
  warnings: [],
  generatedAt: now,
  plannerModelVersion: "PLANNER_MODEL_V1",
} as PlanResult;

describe("command center v2", () => {
  it("composes capacity, routine and capped source-owned signals", async () => {
    const application = createCommandCenterV2Application({
      listTasks: async () => [
        task("now", { dueAt: now + 60_000 }),
        task("linked", { sourceType: "FINANCIAL_OBLIGATION", sourceId: "obligation" }),
      ],
      getPlan: async () => plan,
      listSessions: async () => [
        {
          id: "MORNING_PLANNING:2026-08-15",
          type: "MORNING_PLANNING",
          status: "ACTIVE",
          localDate: "2026-08-15",
          createdAt: now,
          updatedAt: now,
          modelVersion: "ROUTINE_MODEL_V1",
        },
      ],
      listFinanceAlerts: async () => [
        {
          triggerId: "FIN-T04",
          status: "TRIGGERED",
          severity: "CRITICAL",
          financeBookId: "book",
          entityType: "FINANCIAL_OBLIGATION",
          entityId: "obligation",
          reasonCodes: [],
          messageData: {},
          evaluatedAt: now,
          suggestedActions: [],
          title: "duplicate",
          detail: "duplicate",
        },
        {
          triggerId: "FIN-T15",
          status: "TRIGGERED",
          severity: "CRITICAL",
          financeBookId: "book",
          entityType: "FINANCE_BOOK",
          entityId: "book",
          reasonCodes: [],
          messageData: {},
          evaluatedAt: now,
          suggestedActions: [],
          title: "shortfall",
          detail: "shortfall",
        },
      ],
    });
    const result = await application.get({ now, timezone: "UTC", availableSlotMinutes: 30 });
    expect(result.capacity).toMatchObject({
      status: "READY",
      availableMinutes: 180,
      plannedMinutes: 240,
      remainingMinutes: -60,
      overcommitMinutes: 60,
      replanRecommended: true,
    });
    expect(result.routine).toMatchObject({ type: "MORNING_PLANNING", status: "ACTIVE" });
    expect(result.signals.map((signal) => signal.title)).toContain("shortfall");
    expect(result.signals.map((signal) => signal.title)).not.toContain("duplicate");
    expect(result.signals.length).toBeLessThanOrEqual(4);
  });
  it("reports no plan instead of inventing capacity", async () => {
    const application = createCommandCenterV2Application({
      listTasks: async () => [task("now")],
      listSessions: async () => [],
      listFinanceAlerts: async () => [],
    });
    expect((await application.get({ now, timezone: "UTC" })).capacity).toEqual({
      status: "NO_PLAN",
      replanRecommended: false,
    });
  });
});
