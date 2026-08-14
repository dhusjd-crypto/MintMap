import { decideNotification } from "@/engines/notification";
import {
  FINANCE_NOTIFICATION_POLICIES,
  type NotificationEvaluationInput,
} from "@/domain/notification";
import type { FinanceAlertView } from "./types";

/** Maps finance facts into the shared delivery engine; the evaluator never sends notifications. */
export function decideFinanceNotification(
  alert: FinanceAlertView,
  input: Omit<
    NotificationEvaluationInput,
    "sourceType" | "sourceId" | "entityType" | "entityId" | "title" | "body" | "trigger" | "policy"
  >,
) {
  const level = alert.notificationPreset
    ? FINANCE_NOTIFICATION_POLICIES[alert.notificationPreset]
    : "NORMAL";
  return decideNotification({
    ...input,
    sourceType:
      alert.entityType === "FINANCIAL_STATEMENT" ? "FINANCIAL_STATEMENT" : "FINANCIAL_OBLIGATION",
    sourceId: alert.entityId,
    entityType: alert.entityType,
    entityId: alert.entityId,
    title: alert.title,
    body: alert.detail,
    sourceResolved: false,
    policy: {
      ...(input.config?.policies[level] ?? {
        level,
        cooldownMinutes: 60,
        maxNotifications: 1,
        expirationMinutes: 1440,
        quietHoursBehavior: "DEFER",
        actionSet: ["OPEN_SOURCE", "DISMISS"],
      }),
    },
    trigger: {
      id: alert.triggerId,
      severity: alert.severity,
      message: alert.detail,
      reasonCodes: alert.reasonCodes,
    },
  });
}
