import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/architecture/clock";
import { createDomainEvent } from "../../src/lib/architecture/domain-events";
import { FEATURE_FLAGS, isFeatureEnabled } from "../../src/lib/architecture/feature-flags";

describe("architecture foundation", () => {
  it("provides deterministic time without touching browser globals", () => {
    expect(fixedClock(123).now().getTime()).toBe(123);
    expect(fixedClock(123).nowMs()).toBe(123);
  });

  it("creates versioned, identifiable domain events", () => {
    const event = createDomainEvent({
      name: "TaskCompleted",
      aggregateId: "task-1",
      occurredAt: 123,
      payload: { source: "test" },
    });
    expect(event).toMatchObject({
      name: "TaskCompleted",
      aggregateId: "task-1",
      occurredAt: 123,
      schemaVersion: 1,
    });
    expect(event.id).toContain("TaskCompleted:task-1:123:");
  });

  it("keeps risky future domains disabled by default", () => {
    expect(FEATURE_FLAGS.financeDomain).toBe(false);
    expect(FEATURE_FLAGS.smartRescheduling).toBe(false);
    expect(isFeatureEnabled("calendarIntegration")).toBe(true);
  });
});
