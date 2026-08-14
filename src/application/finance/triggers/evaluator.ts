import { getOutstandingAmount } from "@/domain/finance";
import { FINANCE_TRIGGER_CATALOG } from "./catalog";
import {
  DEFAULT_FINANCE_TRIGGER_CONFIG,
  type FinanceAlertView,
  type FinanceTriggerContext,
  type FinanceTriggerEvaluation,
  type FinanceTriggerId,
  type RequiredCashView,
} from "./types";

const DAY = 86_400_000;
function configOf(input: FinanceTriggerContext) {
  return { ...DEFAULT_FINANCE_TRIGGER_CONFIG, ...input.config };
}
function dateKey(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function dayDiff(from: number, to: number, timezone: string) {
  return Math.round(
    (Date.parse(`${dateKey(to, timezone)}T00:00:00Z`) -
      Date.parse(`${dateKey(from, timezone)}T00:00:00Z`)) /
      DAY,
  );
}
function exactDue(obligation: FinanceTriggerContext["obligations"][number]) {
  return obligation.metadata.dueDateHasTime === true;
}
function evaluation(
  input: FinanceTriggerContext,
  triggerId: FinanceTriggerId,
  entityType: FinanceTriggerEvaluation["entityType"],
  entityId: string,
  status: FinanceTriggerEvaluation["status"],
  reasonCodes: string[],
  messageData: Record<string, string | number | boolean> = {},
  actions: string[] = [],
): FinanceTriggerEvaluation {
  const definition = FINANCE_TRIGGER_CATALOG[triggerId];
  return {
    triggerId,
    status,
    severity: definition.severity,
    financeBookId: input.financeBookId,
    entityType,
    entityId,
    reasonCodes,
    messageData,
    evaluatedAt: input.now,
    notificationPreset: definition.preset,
    suggestedActions: actions,
  };
}
function dueStage(days: number) {
  if (days < 0) return "FIN-T06" as const;
  if (days === 0) return "FIN-T04" as const;
  if (days === 1) return "FIN-T03" as const;
  if (days <= 3) return "FIN-T02" as const;
  if (days <= 7) return "FIN-T01" as const;
  return undefined;
}
export function getRequiredCash(
  input: FinanceTriggerContext,
  horizonDays: number,
): RequiredCashView[] {
  const cfg = configOf(input);
  const groups = new Map<string, RequiredCashView>();
  for (const obligation of input.obligations) {
    if (obligation.status === "CANCELLED") continue;
    const days = dayDiff(input.now, obligation.dueDate, cfg.timezone);
    if (days < 0 || days > horizonDays) continue;
    const outstanding = getOutstandingAmount(obligation, [...input.payments]);
    if (outstanding.minorUnits <= 0) continue;
    const prior = groups.get(outstanding.currency) ?? {
      currency: outstanding.currency,
      outstanding: { ...outstanding, minorUnits: 0 },
      obligationIds: [],
      earliestDueDate: obligation.dueDate,
    };
    groups.set(outstanding.currency, {
      ...prior,
      outstanding: {
        ...outstanding,
        minorUnits: prior.outstanding.minorUnits + outstanding.minorUnits,
      },
      obligationIds: [...prior.obligationIds, obligation.id],
      earliestDueDate: Math.min(prior.earliestDueDate ?? obligation.dueDate, obligation.dueDate),
    });
  }
  return [...groups.values()];
}
export function evaluateFinanceTriggers(input: FinanceTriggerContext): FinanceTriggerEvaluation[] {
  const cfg = configOf(input);
  const output: FinanceTriggerEvaluation[] = [];
  for (const obligation of input.obligations) {
    const outstanding = getOutstandingAmount(obligation, [...input.payments]);
    if (["PAID", "CANCELLED"].includes(obligation.status) || outstanding.minorUnits <= 0) continue;
    const days = dayDiff(input.now, obligation.dueDate, cfg.timezone);
    const stage = dueStage(days);
    if (stage)
      output.push(
        evaluation(
          input,
          stage,
          "FINANCIAL_OBLIGATION",
          obligation.id,
          "TRIGGERED",
          [
            stage === "FIN-T06"
              ? "PAYMENT_OVERDUE"
              : `PAYMENT_DUE_${days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : `${days}_DAYS`}`,
          ],
          { daysUntilDue: days, outstandingMinorUnits: outstanding.minorUnits },
          ["OPEN_OBLIGATION", "SCHEDULE_PAYMENT"],
        ),
      );
    const t05 =
      exactDue(obligation) &&
      obligation.dueDate > input.now &&
      obligation.dueDate - input.now <= cfg.dueHoursThreshold * 3_600_000;
    output.push(
      evaluation(
        input,
        "FIN-T05",
        "FINANCIAL_OBLIGATION",
        obligation.id,
        exactDue(obligation) ? (t05 ? "TRIGGERED" : "NOT_TRIGGERED") : "NOT_EVALUATED",
        exactDue(obligation) ? (t05 ? ["PAYMENT_DUE_HOURS"] : []) : ["EXACT_CUTOFF_UNKNOWN"],
        {},
        ["OPEN_OBLIGATION"],
      ),
    );
    if (obligation.minimumAmount && obligation.minimumAmount.minorUnits > 0)
      output.push(
        evaluation(
          input,
          "FIN-T09",
          "FINANCIAL_OBLIGATION",
          obligation.id,
          "TRIGGERED",
          ["MINIMUM_PAYMENT_PRESENT"],
          {
            minimumMinorUnits: obligation.minimumAmount.minorUnits,
            outstandingMinorUnits: outstanding.minorUnits,
          },
          ["OPEN_OBLIGATION"],
        ),
      );
    const history = input.notificationHistory?.find((entry) => entry.entityId === obligation.id);
    if (
      history &&
      Math.max(history.recentDeliveryCount, history.recentPersistentRepeatCount) >=
        cfg.repeatedNudgeThreshold
    )
      output.push(
        evaluation(
          input,
          "FIN-T16",
          "FINANCIAL_OBLIGATION",
          obligation.id,
          "TRIGGERED",
          ["REPEATED_UNPAID_NUDGES"],
          { deliveryCount: history.recentDeliveryCount },
          ["OPEN_OBLIGATION", "CREATE_TASK"],
        ),
      );
    const special =
      obligation.type === "TAX" || obligation.type === "SOCIAL_SECURITY"
        ? "FIN-T17"
        : obligation.type === "SUPPLIER"
          ? "FIN-T18"
          : obligation.type === "LOAN"
            ? "FIN-T19"
            : obligation.type === "SUBSCRIPTION" &&
                days >= 0 &&
                days <= cfg.subscriptionReviewLeadDays
              ? "FIN-T20"
              : undefined;
    if (special)
      output.push(
        evaluation(
          input,
          special,
          "FINANCIAL_OBLIGATION",
          obligation.id,
          "TRIGGERED",
          [
            special === "FIN-T17"
              ? "TAX_DEADLINE"
              : special === "FIN-T18"
                ? "SUPPLIER_PAYMENT_DUE"
                : special === "FIN-T19"
                  ? "LOAN_INSTALLMENT_DUE"
                  : "SUBSCRIPTION_REVIEW_DUE",
          ],
          { daysUntilDue: days },
          ["OPEN_OBLIGATION"],
        ),
      );
  }
  for (const payment of input.payments)
    if (
      (payment.status === "SCHEDULED" || payment.status === "SUBMITTED") &&
      (payment.scheduledFor ?? payment.createdAt) + cfg.scheduledPaymentConfirmationGraceMs <=
        input.now
    )
      output.push(
        evaluation(
          input,
          "FIN-T10",
          "FINANCIAL_PAYMENT",
          payment.id,
          "TRIGGERED",
          ["PAYMENT_NOT_CONFIRMED"],
          {},
          ["OPEN_PAYMENT", "CONFIRM_PAYMENT", "MARK_FAILED"],
        ),
      );
  for (const statement of input.statements) {
    if (
      (statement.reviewStatus === "CAPTURED" || statement.reviewStatus === "REVIEW_REQUIRED") &&
      statement.createdAt + cfg.statementReviewGraceMs <= input.now
    )
      output.push(
        evaluation(
          input,
          "FIN-T07",
          "FINANCIAL_STATEMENT",
          statement.id,
          "TRIGGERED",
          ["STATEMENT_REVIEW_REQUIRED"],
          {},
          ["OPEN_STATEMENT"],
        ),
      );
    if (
      ["CONFIRMED", "RECONCILED"].includes(statement.reviewStatus) &&
      statement.newBalance.minorUnits > 0 &&
      !input.obligations.some((obligation) => obligation.statementId === statement.id)
    )
      output.push(
        evaluation(
          input,
          "FIN-T08",
          "FINANCIAL_STATEMENT",
          statement.id,
          "TRIGGERED",
          ["STATEMENT_WITHOUT_OBLIGATION"],
          {},
          ["CREATE_OBLIGATION"],
        ),
      );
  }
  for (const schedule of input.schedules) {
    if (!schedule.enabled || !schedule.nextOccurrence || schedule.nextOccurrence > input.now)
      continue;
    const key = `${schedule.id}:${new Date(schedule.nextOccurrence).toISOString().slice(0, 10)}`;
    if (!input.obligations.some((item) => item.metadata.recurrenceOccurrenceKey === key))
      output.push(
        evaluation(
          input,
          "FIN-T12",
          "FINANCIAL_SCHEDULE",
          schedule.id,
          "TRIGGERED",
          ["EXPECTED_RECURRING_OBLIGATION_MISSING"],
          { occurrenceKey: key },
          ["GENERATE_MISSING_OCCURRENCE", "OPEN_SCHEDULE"],
        ),
      );
  }
  for (const horizon of [7, 30] as const)
    for (const cash of getRequiredCash(input, horizon)) {
      const threshold = (
        horizon === 7 ? cfg.cashRequirement7DayThresholds : cfg.cashRequirement30DayThresholds
      )[cash.currency];
      output.push(
        evaluation(
          input,
          horizon === 7 ? "FIN-T13" : "FIN-T14",
          "FINANCE_BOOK",
          input.financeBookId,
          threshold === undefined
            ? "NOT_EVALUATED"
            : cash.outstanding.minorUnits >= threshold
              ? "TRIGGERED"
              : "NOT_TRIGGERED",
          threshold === undefined
            ? ["CASH_THRESHOLD_NOT_CONFIGURED"]
            : [horizon === 7 ? "HIGH_7_DAY_CASH_REQUIREMENT" : "HIGH_30_DAY_CASH_REQUIREMENT"],
          { currency: cash.currency, outstandingMinorUnits: cash.outstanding.minorUnits },
          ["OPEN_OBLIGATIONS"],
        ),
      );
    }
  const cashflowContext = input.cashflowSignals?.find(
    (signal) => signal.financeBookId === input.financeBookId,
  );
  const shortfall = input.cashflowSignals?.find(
    (signal) =>
      signal.financeBookId === input.financeBookId && signal.shortfallAmount.minorUnits > 0,
  );
  output.push(
    evaluation(
      input,
      "FIN-T15",
      "FINANCE_BOOK",
      input.financeBookId,
      shortfall ? "TRIGGERED" : cashflowContext ? "NOT_TRIGGERED" : "NOT_EVALUATED",
      shortfall ? ["EXPECTED_CASH_SHORTFALL"] : cashflowContext ? [] : ["CASHFLOW_CONTEXT_MISSING"],
      shortfall ? { shortfallMinorUnits: shortfall.shortfallAmount.minorUnits } : {},
      ["OPEN_CASHFLOW"],
    ),
  );
  return output;
}
export function toFinanceAlertView(
  evaluation: FinanceTriggerEvaluation,
  privacyMode: "FULL" | "MASK_AMOUNT" | "GENERIC" = "FULL",
): FinanceAlertView {
  const title = FINANCE_TRIGGER_CATALOG[evaluation.triggerId].name;
  const amount = evaluation.messageData.outstandingMinorUnits;
  const detail =
    privacyMode === "GENERIC"
      ? "Finans kaydın için işlem gerekiyor."
      : privacyMode === "MASK_AMOUNT"
        ? "Ödeme veya inceleme gerektiren bir finans kaydı var."
        : amount !== undefined
          ? `Kalan tutar: ${amount} minor unit.`
          : "Finans kaydını gözden geçir.";
  return { ...evaluation, title, detail };
}
