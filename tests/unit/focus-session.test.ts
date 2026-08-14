import { describe, expect, it } from "vitest";
import { FocusSessionRepository } from "@/application/repositories/focus-session-repository";
import { FocusSessionService } from "@/application/focus/focus-service";
import { fixedClock } from "@/lib/architecture/clock";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";

describe("FocusSessionService", () => {
  it("persists a session, excludes pauses, and records actual minutes on completion", async () => {
    let now = 1_000_000;
    const clock = { now: () => new Date(now), nowMs: () => now };
    const repository = new FocusSessionRepository(new InMemoryCanonicalStorage());
    const recorded: number[] = [];
    const service = new FocusSessionService({
      clock,
      repository,
      idFactory: () => "focus-1",
      onTimeRecorded: async (_taskId, minutes) => recorded.push(minutes),
    });
    const started = await service.start("task-1", "COUNTDOWN", 25);
    now += 10 * 60_000;
    const paused = await service.pause();
    now += 20 * 60_000;
    const resumed = await service.resume();
    expect(paused.accumulatedActiveMs).toBe(10 * 60_000);
    expect(resumed.status).toBe("ACTIVE");
    now += 5 * 60_000;
    const completed = await service.complete();
    expect(completed.status).toBe("COMPLETED");
    expect(completed.accumulatedActiveMs).toBe(15 * 60_000);
    expect(recorded).toEqual([15]);
    expect((await repository.get(started.id))?.status).toBe("COMPLETED");
  });

  it("blocks overlapping sessions and recovers stale active work without counting unknown time", async () => {
    let now = 2_000_000;
    const clock = { now: () => new Date(now), nowMs: () => now };
    const service = new FocusSessionService({
      clock,
      repository: new FocusSessionRepository(new InMemoryCanonicalStorage()),
      idFactory: () => "focus-2",
      staleAfterMinutes: 60,
    });
    await service.start("task-1", "FLOW");
    await expect(service.start("task-2", "FLOW")).rejects.toThrow();
    now += 61 * 60_000;
    const recovered = await service.recover();
    expect(recovered?.status).toBe("PAUSED");
    expect(recovered?.staleRecoveryRequired).toBe(true);
    expect(recovered?.accumulatedActiveMs).toBe(0);
  });
});
