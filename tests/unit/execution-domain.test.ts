import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/architecture/clock";
import {
  completeTask,
  canTransitionTaskState,
  cancelTask,
  createExecutionTask,
  isHardDeadlinePassed,
  isPlannedForDate,
  isFollowUpDue,
  isTaskActionable,
  isTaskReadyCandidate,
  reopenTask,
  setWaiting,
  snoozeTask,
  startTask,
  type ExecutionTask,
} from "../../src/domain/execution/task";
import {
  addDependency,
  hasIncompleteDependencies,
  reevaluateBlockedTask,
} from "../../src/domain/execution/dependencies";
import {
  legacyTaskToDomainTask,
  domainTaskToLegacyPatch,
} from "../../src/application/mapping/execution-task-mapping";
import type { Todo } from "../../src/lib/mindmap-store";

const clock = fixedClock(1_000);

function task(id = "task-1", state: ExecutionTask["state"] = "READY"): ExecutionTask {
  return createExecutionTask({ id, title: id, state }, clock);
}

describe("Execution Domain state policy", () => {
  it.each([
    ["INBOX", "READY", true],
    ["READY", "DOING", true],
    ["DOING", "DONE", true],
    ["DONE", "DOING", false],
    ["WAITING", "NOW", false],
    ["SOMEDAY", "NOW", false],
    ["READY", "DOING", false, true],
  ] as const)("transition %s -> %s", (from, to, expected, dependenciesIncomplete = false) => {
    expect(canTransitionTaskState(from, to, { dependenciesIncomplete })).toBe(expected);
  });

  it("requires explicit reopen and maintains completion metadata policy", () => {
    const done = completeTask(task(), clock);
    expect(done.state).toBe("DONE");
    expect(done.completedAt).toBe(1_000);
    expect(() => startTask(done, clock)).toThrow();
    const reopened = reopenTask(done, clock);
    expect(reopened.state).toBe("READY");
    expect(reopened.completedAt).toBeUndefined();
  });

  it("keeps WAITING separate from follow-up eligibility", () => {
    const waiting = setWaiting(task(), "Ahmet", clock, 900);
    expect(waiting.state).toBe("WAITING");
    expect(isFollowUpDue(waiting, clock)).toBe(true);
    expect(isTaskActionable(waiting, clock)).toBe(false);
  });

  it("applies future start and dependency exclusions without scoring", () => {
    const future = { ...task(), startAt: 2_000 };
    expect(isTaskReadyCandidate(future, clock)).toBe(false);
    expect(isTaskReadyCandidate(task(), clock, true)).toBe(false);
  });

  it("keeps planning dates distinct and validates execution metadata", () => {
    const planned = { ...task(), doAt: 2_000, dueAt: 4_000, softEndAt: 3_000 };
    expect(isPlannedForDate(planned, new Date(2_000))).toBe(true);
    expect(isHardDeadlinePassed({ ...planned, dueAt: 900 }, clock)).toBe(true);
    expect(() =>
      createExecutionTask({ id: "bad", title: "bad", estimatedMinutes: -1 }, clock),
    ).toThrow();
    expect(() =>
      createExecutionTask(
        { id: "bad", title: "bad", minChunkMinutes: 20, maxChunkMinutes: 10 },
        clock,
      ),
    ).toThrow();
  });

  it("snoozes the reminder without moving the hard deadline", () => {
    const original = { ...task(), dueAt: 4_000, doAt: 2_000 };
    const snoozed = snoozeTask(original, 3_000, clock);
    expect(snoozed.remindAt).toBe(3_000);
    expect(snoozed.dueAt).toBe(4_000);
    expect(snoozed.snoozeCount).toBe(1);
  });

  it("does not treat cancellation as completion", () => {
    const cancelled = cancelTask(task(), clock);
    expect(cancelled.state).toBe("CANCELLED");
    expect(cancelled.completedAt).toBeUndefined();
  });
});

describe("Execution Domain dependencies", () => {
  it("rejects self and circular dependencies", () => {
    const a = task("a");
    const b = task("b");
    const lookup = (id: string) => (id === "a" ? a : id === "b" ? b : undefined);
    expect(() => addDependency(a, { taskId: "a" }, lookup)).toThrow();
    const bBlocked = addDependency(b, { taskId: "a" }, lookup);
    const lookupWithB = (id: string) => (id === "b" ? bBlocked : lookup(id));
    expect(() => addDependency(a, { taskId: "b" }, lookupWithB)).toThrow();
  });

  it("reports incomplete dependencies and unblocks after DONE", () => {
    const blocker = task("blocker");
    const blocked = addDependency(task("blocked"), { taskId: blocker.id }, (id) =>
      id === blocker.id ? blocker : undefined,
    );
    expect(
      hasIncompleteDependencies(blocked, (id) => (id === blocker.id ? blocker : undefined)),
    ).toBe(true);
    const completedBlocker = completeTask(blocker, clock);
    expect(
      hasIncompleteDependencies(blocked, (id) =>
        id === completedBlocker.id ? completedBlocker : undefined,
      ),
    ).toBe(false);
  });

  it("re-evaluates one blocked task without selecting NOW or notifying", () => {
    const blocker = completeTask(task("blocker"), clock);
    const blocked = { ...task("blocked", "BLOCKED"), blockedBy: [{ taskId: blocker.id }] };
    const ready = reevaluateBlockedTask(
      blocked,
      (id) => (id === blocker.id ? blocker : undefined),
      clock,
    );
    expect(ready?.state).toBe("READY");
  });
});

describe("legacy execution mapping", () => {
  it("maps old records with safe defaults and preserves canonical IDs", () => {
    const legacy = { id: "legacy-1", text: "Eski görev", done: false } as Todo;
    const domain = legacyTaskToDomainTask(legacy, { projectId: "node-1" });
    expect(domain.id).toBe("legacy-1");
    expect(domain.state).toBe("READY");
    expect(domain.snoozeCount).toBe(0);
    expect(domain.projectId).toBe("node-1");
  });

  it("uses a patch so unknown legacy fields are not overwritten", () => {
    const legacy = { id: "legacy-2", text: "Görev", done: false, vendorField: "keep" } as Todo & {
      vendorField: string;
    };
    const domain = legacyTaskToDomainTask(legacy);
    const patch = domainTaskToLegacyPatch({ ...domain, title: "Güncel" }, legacy);
    expect(patch.text).toBe("Güncel");
    expect((patch as typeof patch & { vendorField?: string }).vendorField).toBeUndefined();
    expect(legacy.vendorField).toBe("keep");
  });
});
