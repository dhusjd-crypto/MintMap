import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_CONFIG, type NotificationHistoryView } from "@/domain/notification";
import { decideNotification, resolveRelativeReminder } from "@/engines/notification";
import { InMemoryNotificationAdapter } from "@/infrastructure/notifications";
import {
  createNotificationCoordinator,
  handleNotificationAction,
} from "@/application/notifications";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";
import { NotificationRepository } from "@/application/repositories/notification-repository";

const now = Date.parse("2026-08-14T10:00:00Z");
const base = (extra: Partial<Parameters<typeof decideNotification>[0]> = {}) => ({
  now,
  sourceType: "TASK" as const,
  sourceId: "task-1",
  entityType: "Task",
  entityId: "task-1",
  title: "Görevi başlat",
  trigger: { id: "T02", severity: "ATTENTION" as const, message: "Şimdi uygun" },
  ...extra,
});
const history = (extra: Partial<NotificationHistoryView> = {}): NotificationHistoryView => ({
  dedupeKey: "task:task-1:T02",
  entityId: "task-1",
  level: "NORMAL",
  createdAt: now,
  status: "DELIVERED",
  repeatIndex: 0,
  ...extra,
});

describe("platform bağımsız Notification Engine", () => {
  it("separates trigger severity from notification policy and builds an intent", () => {
    const decision = decideNotification(
      base({ trigger: { id: "T08", severity: "CRITICAL", message: "Son saatler" } }),
    );
    expect(decision.kind).toBe("SEND_NOW");
    expect(decision.level).toBe("CRITICAL");
    expect(decision.intent?.dedupeKey).toBe("task:task-1:T08");
    expect(decision.intent?.actions.map((action) => action.type)).toContain("DONE");
  });
  it("deduplicates and applies cooldown per entity/trigger", () => {
    const decision = decideNotification(base({ history: [history()] }));
    expect(decision.kind).toBe("SUPPRESS");
    expect(decision.reasonCodes).toContain("SUPPRESS_COOLDOWN");
    expect(decideNotification(base({ entityId: "task-2", history: [history()] })).kind).toBe(
      "SEND_NOW",
    );
  });
  it("supports entity and global fatigue without suppressing critical alerts", () => {
    const noisy = Array.from({ length: 5 }, (_, index) =>
      history({ createdAt: now - (70 + index * 10) * 60_000 }),
    );
    expect(decideNotification(base({ history: noisy })).reasonCodes).toContain(
      "SUPPRESS_ENTITY_FATIGUE",
    );
    const critical = decideNotification(
      base({ history: noisy, trigger: { id: "T08", severity: "CRITICAL", message: "Kritik" } }),
    );
    expect(critical.kind).toBe("SEND_NOW");
  });
  it("handles same-day and cross-midnight quiet hours", () => {
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      quietHours: {
        startLocalTime: "22:30",
        endLocalTime: "07:30",
        timezone: "Europe/Istanbul",
        allowedLevels: ["CRITICAL"] as const,
        behavior: "DEFER" as const,
      },
    };
    const quiet = decideNotification(base({ now: Date.parse("2026-08-14T20:00:00Z"), config }));
    expect(quiet.kind).toBe("DEFER");
    const daytime = decideNotification(base({ config, now: Date.parse("2026-08-14T08:00:00Z") }));
    expect(daytime.kind).toBe("SEND_NOW");
  });
  it("keeps critical notifications bounded and supports persistent repeats", () => {
    const persistent = decideNotification(
      base({
        policy: DEFAULT_NOTIFICATION_CONFIG.policies.PERSISTENT,
        history: [history({ level: "PERSISTENT", createdAt: now - 90 * 60_000 })],
      }),
    );
    expect(persistent.kind).toBe("SEND_NOW");
    expect(persistent.level).toBe("PERSISTENT");
    const exhausted = Array.from({ length: 6 }, (_, index) =>
      history({ level: "PERSISTENT", createdAt: now - (index + 1) * 90 * 60_000 }),
    );
    expect(
      decideNotification(
        base({ policy: DEFAULT_NOTIFICATION_CONFIG.policies.PERSISTENT, history: exhausted }),
      ).kind,
    ).toBe("SUPPRESS");
  });
  it("resolves relative reminders and rejects missing/past anchors", () => {
    expect(
      resolveRelativeReminder(
        { anchor: "DUE_AT", offsetMinutes: 60 },
        { DUE_AT: now + 3 * 60 * 60_000 },
      )?.scheduledFor,
    ).toBe(now + 2 * 60 * 60_000);
    expect(resolveRelativeReminder({ anchor: "DO_AT", offsetMinutes: 60 }, {})).toBeUndefined();
  });
  it("degrades explicitly when the platform lacks critical and action capabilities", () => {
    const decision = decideNotification(
      base({
        trigger: { id: "T08", severity: "CRITICAL", message: "Kritik" },
        capabilities: {
          supportsActions: false,
          supportsPersistent: false,
          supportsCritical: false,
          supportsScheduledDelivery: false,
          supportsDeepLink: false,
          supportsExactScheduling: false,
        },
      }),
    );
    expect(decision.level).toBe("NORMAL");
    expect(decision.reasonCodes).toContain("DEGRADED_PLATFORM_CAPABILITY");
  });
  it("routes notification actions through application handlers", async () => {
    const adapter = new InMemoryNotificationAdapter();
    const coordinator = createNotificationCoordinator(adapter);
    const decision = coordinator.decide(base());
    await coordinator.apply(decision);
    expect((await adapter.listScheduled()).length).toBe(1);
    const result = await handleNotificationAction(decision.intent!, "DONE", {
      DONE: async () => true,
    });
    expect(result.status).toBe("SUCCESS");
    expect((await handleNotificationAction(decision.intent!, "MARK_PAID", {})).status).toBe(
      "NOT_SUPPORTED",
    );
  });
  it("persists intents, history, and schedule metadata through canonical storage", async () => {
    const repository = new NotificationRepository(new InMemoryCanonicalStorage());
    const decision = decideNotification(base());
    await repository.saveIntent(decision.intent!);
    await repository.appendHistory({
      id: "record-1",
      intentId: decision.intent!.id,
      entityType: "Task",
      entityId: "task-1",
      level: decision.level,
      repeatIndex: 0,
      dedupeKey: decision.intent!.dedupeKey,
      createdAt: now,
      status: "SCHEDULED",
    });
    await repository.saveSchedule({
      id: "schedule-1",
      intentId: decision.intent!.id,
      status: "SCHEDULED",
      updatedAt: now,
    });
    expect((await repository.listIntents()).length).toBe(1);
    expect((await repository.listHistory()).length).toBe(1);
    expect((await repository.listSchedules()).length).toBe(1);
  });
  it("cancels resolved notification intents without mutating source state", () => {
    const decision = decideNotification(base({ sourceResolved: true }));
    expect(decision.kind).toBe("CANCEL_EXISTING");
    expect(decision.reasonCodes).toContain("CANCEL_SOURCE_COMPLETED");
  });
});
