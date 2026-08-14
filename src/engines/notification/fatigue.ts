import type {
  NotificationHistoryView,
  NotificationLevel,
  NotificationPolicyConfig,
} from "@/domain/notification";

export function hasCooldown(
  history: readonly NotificationHistoryView[],
  dedupeKey: string,
  now: number,
  minutes: number,
) {
  const last = history
    .filter((item) => item.dedupeKey === dedupeKey && item.status !== "CANCELLED")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return !!last && now - last.createdAt < minutes * 60_000;
}
export function entityFatigue(
  history: readonly NotificationHistoryView[],
  entityId: string,
  now: number,
  windowMinutes: number,
) {
  return history.filter(
    (item) =>
      item.entityId === entityId &&
      now - item.createdAt <= windowMinutes * 60_000 &&
      item.status !== "CANCELLED",
  ).length;
}
export function globalFatigue(
  history: readonly NotificationHistoryView[],
  now: number,
  windowMinutes: number,
) {
  return history.filter(
    (item) => now - item.createdAt <= windowMinutes * 60_000 && item.status !== "CANCELLED",
  ).length;
}
export function repeatAllowed(
  history: readonly NotificationHistoryView[],
  dedupeKey: string,
  policy: NotificationPolicyConfig,
  now: number,
) {
  const repeat = policy.repeat;
  if (!repeat) return true;
  const records = history.filter(
    (item) => item.dedupeKey === dedupeKey && now - item.createdAt <= repeat.windowMinutes * 60_000,
  );
  return records.length < Math.min(policy.maxNotifications, repeat.maxRepeats);
}
export function levelRank(level: NotificationLevel) {
  return level === "CRITICAL" ? 3 : level === "PERSISTENT" ? 2 : 1;
}
