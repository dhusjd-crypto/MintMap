import {
  createFinancialObligation,
  type FinancialObligation,
  type FinancialSchedule,
} from "@/domain/finance";
import type { Clock } from "@/lib/architecture/clock";
import type { FinanceTriggerConfig } from "./types";

type Template = {
  amountDueMinorUnits: number;
  currency: "TRY" | "USD" | "EUR";
  dueOffsetDays?: number;
  accountId?: string;
  paymentAccountId?: string;
  minimumAmountMinorUnits?: number;
};
const DAY = 86_400_000;
function clampMonth(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate() < day
    ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    : day;
}
export function nextOccurrence(date: number, recurrence: string): number | undefined {
  const source = new Date(date);
  const result = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate(), 12),
  );
  if (recurrence === "WEEKLY") result.setUTCDate(result.getUTCDate() + 7);
  else if (recurrence === "MONTHLY") {
    const targetMonth = result.getUTCMonth() + 1;
    result.setUTCMonth(
      targetMonth,
      clampMonth(result.getUTCFullYear(), targetMonth, source.getUTCDate()),
    );
  } else if (recurrence === "YEARLY") result.setUTCFullYear(result.getUTCFullYear() + 1);
  else if (/^INTERVAL_DAYS:\d+$/.test(recurrence))
    result.setUTCDate(result.getUTCDate() + Number(recurrence.split(":")[1]));
  else return undefined;
  return result.getTime();
}
export function generateRecurringObligations(
  schedules: readonly FinancialSchedule[],
  existing: readonly FinancialObligation[],
  now: number,
  clock: Clock,
  config: Pick<FinanceTriggerConfig, "recurrenceLookaheadDays">,
) {
  const created: FinancialObligation[] = [];
  const updated: FinancialSchedule[] = [];
  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const template = schedule.metadata.template as Template | undefined;
    if (!template || template.amountDueMinorUnits <= 0) continue;
    let occurrence = schedule.nextOccurrence ?? schedule.startDate;
    const limit = now + config.recurrenceLookaheadDays * DAY;
    while (occurrence < now - DAY) {
      const next = nextOccurrence(occurrence, schedule.recurrence);
      if (!next) break;
      occurrence = next;
    }
    while (occurrence <= limit && (!schedule.endDate || occurrence <= schedule.endDate)) {
      const key = `${schedule.id}:${new Date(occurrence).toISOString().slice(0, 10)}`;
      if (
        !existing.some((item) => item.metadata.recurrenceOccurrenceKey === key) &&
        !created.some((item) => item.metadata.recurrenceOccurrenceKey === key)
      )
        created.push(
          createFinancialObligation(
            {
              id: `recurrence:${key}`,
              financeBookId: schedule.financeBookId,
              type: schedule.type,
              title: `${schedule.name} — ${new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(occurrence))}`,
              dueDate: occurrence + (template.dueOffsetDays ?? 0) * DAY,
              amountDue: { minorUnits: template.amountDueMinorUnits, currency: template.currency },
              minimumAmount: template.minimumAmountMinorUnits
                ? { minorUnits: template.minimumAmountMinorUnits, currency: template.currency }
                : undefined,
              accountId: template.accountId,
              paymentAccountId: template.paymentAccountId,
              recurrenceScheduleId: schedule.id,
              sourceType: "MANUAL",
              metadata: { recurrenceOccurrenceKey: key, scheduleId: schedule.id, generatedAt: now },
            },
            clock,
          ),
        );
      const next = nextOccurrence(occurrence, schedule.recurrence);
      if (!next) break;
      occurrence = next;
    }
    if (occurrence !== schedule.nextOccurrence)
      updated.push({ ...schedule, nextOccurrence: occurrence, updatedAt: now });
  }
  return { created, updated };
}
