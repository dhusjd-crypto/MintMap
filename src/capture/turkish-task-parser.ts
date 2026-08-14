import {
  TURKISH_CAPTURE_PARSER_VERSION,
  type CaptureFields,
  type CaptureProposal,
  type TurkishParserConfig,
} from "@/domain/capture";

const weekdays = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function localParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
}
function localDate(timestamp: number, timezone: string) {
  const parts = localParts(timestamp, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function zonedTimestamp(date: string, hour: number, minute: number, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 2; i++) {
    const p = localParts(utc, timezone);
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour ?? hour),
      Number(p.minute ?? minute),
    );
    utc += Date.UTC(year, month - 1, day, hour, minute) - asUtc;
  }
  return utc;
}
function addLocalDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function findDate(text: string, config: TurkishParserConfig) {
  const base = localDate(config.now, config.timezone);
  if (/öbür gün/i.test(text)) return addLocalDays(base, 2);
  if (/yarın/i.test(text)) return addLocalDays(base, 1);
  if (/bugün/i.test(text)) return base;
  const weekday = weekdays.findIndex((day) => new RegExp(`\\b${escape(day)}\\b`, "i").test(text));
  if (weekday >= 0) {
    const current = new Date(`${base}T12:00:00Z`).getUTCDay();
    let delta = (weekday - current + 7) % 7;
    if (delta === 0 && !/bugün/i.test(text)) delta = 7;
    return addLocalDays(base, delta);
  }
  return undefined;
}
function findTime(text: string, day: string | undefined, config: TurkishParserConfig) {
  const exact = text.match(
    /(?:saat\s*)?(\d{1,2})(?::|\.)(\d{2})\s*(?:'da|da|de|te|ta)?|(?:saat\s*)?(\d{1,2})\s*(?:'da|da|de|te|ta)/i,
  );
  let hour = exact ? Number(exact[1] ?? exact[3]) : undefined;
  const minute = exact?.[2] ? Number(exact[2]) : 0;
  let inferred = false;
  const daypart = /öğleden sonra/i.test(text)
    ? "öğleden sonra"
    : /sabah/i.test(text)
      ? "sabah"
      : /akşam/i.test(text)
        ? "akşam"
        : undefined;
  if (hour === undefined && daypart) {
    hour =
      config.daypartDefaults?.[daypart] ??
      (daypart === "sabah" ? 9 : daypart === "akşam" ? 19 : 15);
    inferred = true;
  }
  if (hour === undefined || !day) return { timestamp: undefined, inferred };
  return { timestamp: zonedTimestamp(day, hour, minute, config.timezone), inferred };
}
function duration(text: string) {
  const hourMinute = text.match(/(\d+(?:[.,]\d+)?)\s*saat\s*(?:(\d+)\s*dk|dakika)?/i);
  if (hourMinute)
    return Math.round(Number(hourMinute[1].replace(",", ".")) * 60 + Number(hourMinute[2] ?? 0));
  const minutes = text.match(/(\d+)\s*(?:dk|dakika)\b/i);
  return minutes ? Number(minutes[1]) : undefined;
}
function explicitRoleDate(text: string, config: TurkishParserConfig, role: "start" | "followUp") {
  const marker = role === "start" ? /(?:başla|başlat|başlama)/i : /(?:takip et|kontrol et)/i;
  if (!marker.test(text)) return undefined;
  const day = findDate(text, config);
  if (!day) return undefined;
  const time = findTime(text, day, config);
  return time.timestamp ?? zonedTimestamp(day, 9, 0, config.timezone);
}
function cleanTitle(text: string, fields: CaptureFields) {
  return (
    text
      .replace(/#[\p{L}\d_-]+/gu, "")
      .replace(/!(?:kritik|yüksek|normal|düşük)\b/gi, "")
      .replace(
        /(?:yarın|bugün|öbür gün|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)(?:\s+sabah|\s+öğleden sonra|\s+akşam)?/gi,
        "",
      )
      .replace(/(?:saat\s*)?\d{1,2}(?::|\.)\d{2}\s*(?:'da|da|de|te|ta)?/gi, "")
      .replace(/(?:saat\s*)?\d{1,2}\s*(?:'da|da|de|te|ta)(?=\s|$)/gi, "")
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:dk|dakika|saat)(?:\s*\d+\s*dk)?\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[,:-]\s*$/, "")
      .trim() || text.trim()
  );
}
export function parseTurkishCapture(
  text: string,
  config: TurkishParserConfig,
): Omit<CaptureProposal, "id" | "captureItemId" | "createdAt"> {
  const raw = text.trim();
  const day = findDate(raw, config);
  const time = findTime(raw, day, config);
  const fields: CaptureFields = {};
  const warnings: string[] = [];
  const hardDeadline = /son tarih|deadline|en geç|tarihine kadar|bitmiş olmalı/i.test(raw);
  const waiting =
    raw.match(
      /^(.+?)\s+(?:bekle|bekliyorum)(?:\s+(?:cuma|yarın|bugün|pazartesi|salı|çarşamba|perşembe|cumartesi|pazar))?(?:\s+takip et)?$/i,
    ) ??
    raw.match(
      /(?:bekle|bekliyorum|cevap verince)\s+([^,]+?)(?:\s+(?:cuma|yarın|bugün|pazartesi|salı|çarşamba|perşembe|cumartesi|pazar))?(?:\s+takip et)?$/i,
    );
  if (day && time.timestamp) {
    if (hardDeadline) fields.dueAt = time.timestamp;
    else fields.doAt = time.timestamp;
  }
  if (day && hardDeadline && !fields.dueAt)
    fields.dueAt = zonedTimestamp(day, 17, 0, config.timezone);
  const startAt = explicitRoleDate(raw, config, "start");
  const followUpAt = explicitRoleDate(raw, config, "followUp");
  if (startAt) fields.startAt = startAt;
  if (followUpAt) fields.followUpAt = followUpAt;
  if (day && !time.timestamp && /hatırlat/i.test(raw))
    fields.remindAt = zonedTimestamp(day, 9, 0, config.timezone);
  if (/hatırlat/i.test(raw) && /\d+\s*saat\s*sonra/i.test(raw))
    fields.remindAt = config.now + Number(raw.match(/\d+/)?.[0] ?? 0) * 3_600_000;
  if (waiting) {
    fields.waitingFor = waiting[1].trim();
    fields.waitingReason = raw;
  }
  const durationMinutes = duration(raw);
  if (durationMinutes && durationMinutes > 0 && durationMinutes <= 24 * 60)
    fields.estimatedMinutes = durationMinutes;
  const priority = raw.match(/!(kritik|yüksek|normal|düşük)\b/i)?.[1]?.toLocaleLowerCase("tr-TR");
  if (priority)
    fields.priority = ({ kritik: 1, yüksek: 2, normal: 3, düşük: 4 } as const)[
      priority as "kritik" | "yüksek" | "normal" | "düşük"
    ];
  const projectToken = raw.match(/#([\p{L}\d_-]+)/u)?.[1];
  if (projectToken) {
    fields.projectToken = projectToken;
    const matches =
      config.projects?.filter(
        (project) =>
          project.title.toLocaleLowerCase("tr-TR") === projectToken.toLocaleLowerCase("tr-TR"),
      ) ?? [];
    if (matches.length === 1) fields.projectId = matches[0].id;
    else if (matches.length > 1) warnings.push("AMBIGUOUS_PROJECT");
  }
  if (time.inferred) warnings.push("TIME_INFERRED_FROM_DAYPART");
  if (day && !time.timestamp && !fields.remindAt) warnings.push("DATE_WITHOUT_EXACT_TIME");
  if (day && !hardDeadline && fields.doAt) warnings.push("DATE_IS_PLAN_INTENT_NOT_DEADLINE");
  if (hardDeadline && !fields.dueAt) warnings.push("AMBIGUOUS_DEADLINE");
  if (waiting) warnings.push("WAITING_REQUIRES_CONFIRMATION");
  const proposalType = waiting ? "WAITING_TASK" : raw.length > 0 ? "TASK" : "UNKNOWN";
  const title = cleanTitle(raw, fields);
  const requiresConfirmation =
    warnings.some((warning) =>
      ["AMBIGUOUS_PROJECT", "AMBIGUOUS_DEADLINE", "WAITING_REQUIRES_CONFIRMATION"].includes(
        warning,
      ),
    ) || fields.dueAt !== undefined;
  const level = requiresConfirmation ? "MEDIUM" : title.length > 1 ? "HIGH" : "LOW";
  return {
    proposalType,
    confidence: level,
    fieldConfidence: {
      title: { level: "HIGH" },
      doAt: { level: fields.doAt ? "MEDIUM" : "LOW" },
      dueAt: { level: fields.dueAt ? "MEDIUM" : "LOW" },
      projectId: { level: fields.projectId ? "HIGH" : "LOW" },
    },
    fields: { ...fields, title },
    warnings,
    requiresConfirmation,
    parserVersion: TURKISH_CAPTURE_PARSER_VERSION,
  };
}
