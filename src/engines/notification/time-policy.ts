import type {
  NotificationLevel,
  NotificationSourceType,
  QuietHoursPolicy,
  WeekendPolicy,
  WorkingHoursPolicy,
} from "@/domain/notification";

function localParts(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return { minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: get("weekday") };
}
function parseClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
export function isQuietHours(at: number, policy: QuietHoursPolicy) {
  const minute = localParts(at, policy.timezone).minutes;
  const start = parseClock(policy.startLocalTime);
  const end = parseClock(policy.endLocalTime);
  return start === end
    ? true
    : start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
}
export function isWithinWorkingHours(at: number, policy: WorkingHoursPolicy) {
  const minute = localParts(at, policy.timezone).minutes;
  const start = parseClock(policy.startLocalTime);
  const end = parseClock(policy.endLocalTime);
  return start === end
    ? true
    : start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
}
export function isWeekend(at: number, timezone: string) {
  const day = localParts(at, timezone).weekday;
  return day === "Sat" || day === "Sun";
}
export function nextPolicyBoundary(at: number, policy: QuietHoursPolicy | WorkingHoursPolicy) {
  const step = 60_000;
  for (let cursor = at + step; cursor <= at + 48 * 60 * 60_000; cursor += step) {
    const active =
      "allowedLevels" in policy
        ? isQuietHours(cursor, policy)
        : isWithinWorkingHours(cursor, policy);
    if (
      active !==
      ("allowedLevels" in policy ? isQuietHours(at, policy) : isWithinWorkingHours(at, policy))
    )
      return cursor;
  }
  return undefined;
}
export function allowsQuietHours(level: NotificationLevel, policy: QuietHoursPolicy) {
  return policy.allowedLevels.includes(level);
}
export function allowsWeekend(level: NotificationLevel, policy: WeekendPolicy) {
  return policy.allowedLevels.includes(level);
}
export function sourceAllowed(source: NotificationSourceType, policy: WorkingHoursPolicy) {
  return policy.allowedSources.includes(source);
}
