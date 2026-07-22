// Lightweight Turkish natural-language quick-add parser
// Extracts: dueAt, reminderAt, recurrence, tags, starred, myDay, priority
// and returns cleaned task text.

import type { Priority, Recurrence } from "./mindmap-store";

export type ParsedQuickAdd = {
  text: string;
  dueAt?: number;
  reminderAt?: number;
  recurrence?: Recurrence;
  tags?: string[];
  starred?: boolean;
  myDay?: boolean;
  priority?: Priority;
};

const WEEKDAYS: Record<string, number> = {
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
};

function atHour(d: Date, h: number, m = 0) {
  d.setHours(h, m, 0, 0);
  return d;
}

export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  let s = " " + input.trim() + " ";
  const lower = s.toLocaleLowerCase("tr");

  const result: ParsedQuickAdd = { text: input.trim() };

  // ----- Recurrence -----
  if (/\bher\s+gün\b|\bher\s+gun\b|\bgünlük\b|\bgunluk\b/i.test(lower)) {
    result.recurrence = "daily";
    s = s.replace(/\b(her gün|her gun|günlük|gunluk)\b/gi, " ");
  } else if (/\bher\s+hafta\b|\bhaftalık\b|\bhaftalik\b/i.test(lower)) {
    result.recurrence = "weekly";
    s = s.replace(/\b(her hafta|haftalık|haftalik)\b/gi, " ");
  } else if (/\bher\s+ay\b|\baylık\b|\baylik\b/i.test(lower)) {
    result.recurrence = "monthly";
    s = s.replace(/\b(her ay|aylık|aylik)\b/gi, " ");
  }

  // ----- Priority (!1..!4 or p1..p4) -----
  const prioMatch = s.match(/\b(?:!|p)([1-4])\b/i);
  if (prioMatch) {
    result.priority = parseInt(prioMatch[1], 10) as Priority;
    s = s.replace(prioMatch[0], " ");
  }

  // ----- Flags -----
  if (/!{1,}\s|!{1,}$|\bönemli\b|\bonemli\b/i.test(s)) {
    result.starred = true;
    s = s.replace(/!+/g, " ").replace(/\b(önemli|onemli)\b/gi, " ");
  }
  if (/\bgünüm\b|\bgunum\b|\bbugünüm\b/i.test(s)) {
    result.myDay = true;
    s = s.replace(/\b(günüm|gunum|bugünüm)\b/gi, " ");
  }

  // ----- Tags (#etiket) -----
  const tags: string[] = [];
  s = s.replace(/#([\p{L}0-9_-]+)/gu, (_m, t) => {
    tags.push(String(t).toLocaleLowerCase("tr"));
    return " ";
  });
  if (tags.length) result.tags = Array.from(new Set(tags));

  // ----- Date keywords -----
  const base = new Date(now);
  base.setSeconds(0, 0);
  let date: Date | null = null;

  if (/\byarın\b|\byarin\b/i.test(s)) {
    date = new Date(base);
    date.setDate(date.getDate() + 1);
    s = s.replace(/\b(yarın|yarin)\b/gi, " ");
  } else if (/\bbugün\b|\bbugun\b/i.test(s)) {
    date = new Date(base);
    s = s.replace(/\b(bugün|bugun)\b/gi, " ");
  } else if (/\b(gelecek\s+hafta|haftaya)\b/i.test(s)) {
    date = new Date(base);
    date.setDate(date.getDate() + 7);
    s = s.replace(/\b(gelecek\s+hafta|haftaya)\b/gi, " ");
  } else {
    // weekday: "pazartesi", "gelecek cuma"
    const re = new RegExp(
      `\\b(gelecek\\s+)?(${Object.keys(WEEKDAYS).join("|")})\\b`,
      "i",
    );
    const m = s.match(re);
    if (m) {
      const next = !!m[1];
      const day = WEEKDAYS[m[2].toLocaleLowerCase("tr")];
      date = new Date(base);
      const diff = (day - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + diff + (next ? 7 : 0));
      s = s.replace(m[0], " ");
    }
  }

  // ----- Time: "9'da", "9:30", "saat 14", "14:00" -----
  const timeRe = /\b(?:saat\s+)?(\d{1,2})(?::(\d{2}))?(?:['’]?(?:da|de|te|ta))?\b/i;
  const tm = s.match(timeRe);
  let hour: number | null = null;
  let min = 0;
  if (tm && (tm[2] !== undefined || /['’]?(da|de|te|ta)\b|saat/i.test(tm[0]))) {
    const h = parseInt(tm[1], 10);
    if (h >= 0 && h <= 23) {
      hour = h;
      min = tm[2] ? parseInt(tm[2], 10) : 0;
      s = s.replace(tm[0], " ");
    }
  }

  if (date || hour !== null) {
    const d = date ?? new Date(base);
    if (hour !== null) atHour(d, hour, min);
    else atHour(d, 9, 0);
    // If we only had a time and it's already passed today, push to tomorrow
    if (!date && d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    result.dueAt = d.getTime();
    if (hour !== null) result.reminderAt = d.getTime();
  }

  result.text = s.replace(/\s+/g, " ").trim();
  if (!result.text) result.text = input.trim();
  return result;
}
