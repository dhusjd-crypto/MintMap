import type {
  NotificationActionResult,
  NotificationActionType,
  NotificationDecision,
  NotificationIntent,
} from "@/domain/notification";
import { decideNotification } from "@/engines/notification";
import type { NotificationAdapter } from "@/infrastructure/notifications";
import type { TriggerSignal } from "@/engines/trigger";

export type NotificationCommandHandlers = Partial<
  Record<NotificationActionType, (intent: NotificationIntent) => Promise<boolean>>
>;

export function snoozeMinutesForAction(action: NotificationActionType) {
  if (action === "SNOOZE_10_MIN") return 10;
  if (action === "SNOOZE_30_MIN") return 30;
  if (action === "SNOOZE_1_HOUR") return 60;
  return undefined;
}

export function decideFromTrigger(
  input: Omit<Parameters<typeof decideNotification>[0], "trigger">,
  signal: TriggerSignal,
) {
  return decideNotification({
    ...input,
    trigger: {
      id: signal.id,
      severity: signal.severity,
      message: signal.message,
      reasonCodes: signal.reasonCodes,
      taskId: signal.taskId,
    },
  });
}

export function createNotificationCoordinator(adapter: NotificationAdapter) {
  return {
    decide(input: Parameters<typeof decideNotification>[0]) {
      return decideNotification({
        ...input,
        capabilities: input.capabilities ?? adapter.getCapabilities(),
      });
    },
    async apply(decision: NotificationDecision) {
      if (decision.kind === "SEND_NOW" || decision.kind === "SCHEDULE") {
        if (decision.intent) await adapter.schedule(decision.intent);
      }
      return decision;
    },
    async cancelForEntity(entityType: string, entityId: string) {
      await adapter.cancelByEntity(entityType, entityId);
    },
  };
}

export async function handleNotificationAction(
  intent: NotificationIntent,
  action: NotificationActionType,
  handlers: NotificationCommandHandlers,
): Promise<NotificationActionResult> {
  const handler = handlers[action];
  if (!handler)
    return {
      status: "NOT_SUPPORTED",
      action,
      message: "Bu bildirim eylemi bu uygulama bağlamında desteklenmiyor.",
    };
  try {
    const accepted = await handler(intent);
    return accepted
      ? { status: "SUCCESS", action }
      : { status: "STALE", action, message: "Kaynak artık bu eylem için uygun değil." };
  } catch (error) {
    return {
      status: "ERROR",
      action,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
