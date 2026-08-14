import type {
  NotificationDecision,
  NotificationEvaluationInput,
  NotificationIntent,
  NotificationReasonCode,
} from "@/domain/notification";
import { DEFAULT_NOTIFICATION_CONFIG, type NotificationLevel } from "@/domain/notification";
import { entityFatigue, globalFatigue, hasCooldown, levelRank, repeatAllowed } from "./fatigue";
import { escalateNotification } from "./escalation";
import {
  isQuietHours,
  isWeekend,
  isWithinWorkingHours,
  nextPolicyBoundary,
  allowsQuietHours,
  allowsWeekend,
  sourceAllowed,
} from "./time-policy";
import { policyForLevel, resolveNotificationConfig } from "./policy";

function idFor(input: NotificationEvaluationInput, dedupeKey: string) {
  return `notification:${dedupeKey}`;
}
function degrade(
  level: NotificationLevel,
  input: NotificationEvaluationInput,
): { level: NotificationLevel; reason?: NotificationReasonCode } {
  const caps = input.capabilities;
  if (!caps) return { level };
  if (level === "CRITICAL" && !caps.supportsCritical)
    return {
      level: caps.supportsPersistent ? "PERSISTENT" : "NORMAL",
      reason: "DEGRADED_PLATFORM_CAPABILITY",
    };
  if (level === "PERSISTENT" && !caps.supportsPersistent)
    return { level: "NORMAL", reason: "DEGRADED_PLATFORM_CAPABILITY" };
  return { level };
}
export function decideNotification(input: NotificationEvaluationInput): NotificationDecision {
  const config = resolveNotificationConfig(input.config);
  if (input.sourceResolved)
    return {
      kind: "CANCEL_EXISTING",
      level: "NORMAL",
      reasonCodes: ["SUPPRESS_ALREADY_RESOLVED", "CANCEL_SOURCE_COMPLETED"],
    };
  const base = input.policy ?? config.policies.NORMAL;
  const escalated = escalateNotification({
    baseLevel: base.level,
    trigger: input.trigger,
    dueAt: undefined,
    now: input.now,
    snoozeCount: input.snoozeCount,
    policy: base,
  });
  const degraded = degrade(escalated.level, input);
  const level = degraded.level;
  const policy = policyForLevel(config, level);
  const dedupeKey = `${input.sourceType.toLowerCase()}:${input.entityId}:${input.trigger?.id ?? "manual"}`;
  const history = input.history ?? [];
  const reasons: NotificationReasonCode[] = [...escalated.reasons];
  if (degraded.reason) reasons.push(degraded.reason);
  const expiresAt = input.expiresAt ?? input.now + policy.expirationMinutes * 60_000;
  if (expiresAt <= input.now) return { kind: "SUPPRESS", level, reasonCodes: ["EXPIRED"] };
  if (hasCooldown(history, dedupeKey, input.now, policy.cooldownMinutes))
    return { kind: "SUPPRESS", level, reasonCodes: ["SUPPRESS_COOLDOWN"] };
  if (!repeatAllowed(history, dedupeKey, policy, input.now))
    return { kind: "SUPPRESS", level, reasonCodes: ["SUPPRESS_ENTITY_FATIGUE"] };
  const entityCount = entityFatigue(history, input.entityId, input.now, 120);
  const globalCount = globalFatigue(history, input.now, 60);
  if (level !== "CRITICAL" && entityCount >= 4)
    return { kind: "SUPPRESS", level, reasonCodes: ["SUPPRESS_ENTITY_FATIGUE"] };
  if (level === "NORMAL" && globalCount >= (config.globalBudget?.maxNonCriticalPerHour ?? 6))
    return { kind: "SUPPRESS", level, reasonCodes: ["SUPPRESS_GLOBAL_FATIGUE"] };
  if (
    config.weekend &&
    isWeekend(input.now, config.quietHours?.timezone ?? config.workingHours?.timezone ?? "UTC") &&
    config.weekend.behavior === "DEFER" &&
    !allowsWeekend(level, config.weekend)
  ) {
    return {
      kind: "DEFER",
      level,
      scheduledFor: input.now + 24 * 60 * 60_000,
      reasonCodes: ["DEFER_WEEKEND"],
    };
  }
  if (
    config.quietHours &&
    isQuietHours(input.now, config.quietHours) &&
    !allowsQuietHours(level, config.quietHours)
  ) {
    if (config.quietHours.behavior === "SUPPRESS" || policy.quietHoursBehavior === "SUPPRESS")
      return { kind: "SUPPRESS", level, reasonCodes: ["DEFER_QUIET_HOURS"] };
    return {
      kind: "DEFER",
      level,
      scheduledFor: nextPolicyBoundary(input.now, config.quietHours),
      reasonCodes: ["DEFER_QUIET_HOURS"],
    };
  }
  if (
    config.workingHours &&
    !isWithinWorkingHours(input.now, config.workingHours) &&
    !sourceAllowed(input.sourceType, config.workingHours) &&
    level !== "CRITICAL"
  ) {
    return {
      kind: config.workingHours.behavior === "SUPPRESS" ? "SUPPRESS" : "DEFER",
      level,
      scheduledFor: nextPolicyBoundary(input.now, config.workingHours),
      reasonCodes: ["DEFER_WORKING_HOURS"],
    };
  }
  if (input.scheduledFor !== undefined && input.scheduledFor > input.now) {
    reasons.push("SCHEDULE_RELATIVE_REMINDER");
    return {
      kind: "SCHEDULE",
      level,
      scheduledFor: input.scheduledFor,
      reasonCodes: reasons,
      intent: buildIntent(input, level, policy, dedupeKey, reasons, input.scheduledFor),
    };
  }
  if (level === "CRITICAL" || input.trigger?.severity === "CRITICAL")
    reasons.push("SEND_TRIGGER_CRITICAL");
  else if (level === "PERSISTENT" && history.length) reasons.push("SEND_PERSISTENT_REPEAT");
  return {
    kind: "SEND_NOW",
    level,
    reasonCodes: reasons,
    intent: buildIntent(input, level, policy, dedupeKey, reasons, undefined),
  };
}
function buildIntent(
  input: NotificationEvaluationInput,
  level: NotificationLevel,
  policy: ReturnType<typeof policyForLevel>,
  dedupeKey: string,
  reasons: readonly NotificationReasonCode[],
  scheduledFor?: number,
): NotificationIntent {
  const createdAt = input.now;
  return {
    id: idFor(input, dedupeKey),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    triggerId: input.trigger?.id,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    body: input.body,
    level,
    actions: policy.actionSet.map((type) => ({ type })),
    scheduledFor,
    expiresAt: input.expiresAt ?? createdAt + policy.expirationMinutes * 60_000,
    repeatPolicy: policy.repeat,
    cooldownKey: dedupeKey,
    dedupeKey,
    reasonCodes: reasons,
    createdAt,
  };
}
export function selectNotificationDecisions(decisions: readonly NotificationDecision[]) {
  return [...decisions]
    .sort((a, b) => levelRank(b.level) - levelRank(a.level))
    .filter(
      (decision, index, all) =>
        decision.intent?.dedupeKey === undefined ||
        all.findIndex((candidate) => candidate.intent?.dedupeKey === decision.intent?.dedupeKey) ===
          index,
    );
}
