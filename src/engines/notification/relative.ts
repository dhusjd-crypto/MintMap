import type {
  NotificationLevel,
  RelativeReminder,
  RelativeReminderAnchor,
} from "@/domain/notification";

export type RelativeReminderContext = Partial<Record<RelativeReminderAnchor, number>>;
export function resolveRelativeReminder(
  reminder: RelativeReminder,
  context: RelativeReminderContext,
) {
  const anchor = context[reminder.anchor];
  if (anchor === undefined) return undefined;
  return {
    scheduledFor: anchor - reminder.offsetMinutes * 60_000,
    level: reminder.policy ?? ("NORMAL" as NotificationLevel),
  };
}
export function resolveRelativeReminders(
  reminders: readonly RelativeReminder[],
  context: RelativeReminderContext,
  now: number,
  expiresAt?: number,
) {
  return reminders
    .map((reminder) => resolveRelativeReminder(reminder, context))
    .filter((item): item is { scheduledFor: number; level: NotificationLevel } => !!item)
    .filter(
      (item) =>
        item.scheduledFor >= now && (expiresAt === undefined || item.scheduledFor <= expiresAt),
    )
    .sort((a, b) => a.scheduledFor - b.scheduledFor);
}
