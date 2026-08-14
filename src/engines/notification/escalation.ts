import type {
  NotificationLevel,
  NotificationReasonCode,
  NotificationPolicyConfig,
  TriggerNotificationInput,
} from "@/domain/notification";
import { levelRank } from "./fatigue";

export function escalateNotification(input: {
  baseLevel: NotificationLevel;
  trigger?: TriggerNotificationInput;
  dueAt?: number;
  now: number;
  snoozeCount?: number;
  policy: NotificationPolicyConfig;
}) {
  let level = input.baseLevel;
  const reasons: NotificationReasonCode[] = [];
  if (
    input.trigger?.severity === "CRITICAL" ||
    (input.dueAt !== undefined && input.dueAt - input.now <= 2 * 60 * 60_000)
  ) {
    if (levelRank(level) < levelRank("CRITICAL")) level = "CRITICAL";
    reasons.push(
      input.dueAt !== undefined && input.dueAt < input.now
        ? "ESCALATED_OVERDUE"
        : "ESCALATED_DEADLINE",
    );
  } else if (input.trigger?.severity === "HIGH" && level === "NORMAL") {
    level = "PERSISTENT";
    reasons.push("ESCALATED_PERSISTENT_UNRESOLVED");
  }
  if (
    (input.snoozeCount ?? 0) >= (input.policy.escalation?.afterSnoozes ?? Number.MAX_SAFE_INTEGER)
  ) {
    level = input.policy.escalation?.level ?? "PERSISTENT";
    reasons.push("ESCALATED_REPEATED_SNOOZE");
  }
  return { level, reasons };
}
