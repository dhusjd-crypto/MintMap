import type {
  CreditCardStatement,
  FinancialObligation,
  FinancialPayment,
  FinancialSchedule,
  Money,
} from "@/domain/finance";

export const FINANCE_TRIGGER_IDS = [
  "FIN-T01",
  "FIN-T02",
  "FIN-T03",
  "FIN-T04",
  "FIN-T05",
  "FIN-T06",
  "FIN-T07",
  "FIN-T08",
  "FIN-T09",
  "FIN-T10",
  "FIN-T11",
  "FIN-T12",
  "FIN-T13",
  "FIN-T14",
  "FIN-T15",
  "FIN-T16",
  "FIN-T17",
  "FIN-T18",
  "FIN-T19",
  "FIN-T20",
] as const;
export type FinanceTriggerId = (typeof FINANCE_TRIGGER_IDS)[number];
export type FinanceTriggerStatus = "TRIGGERED" | "NOT_TRIGGERED" | "NOT_EVALUATED";
export type FinanceTriggerSeverity = "INFO" | "ATTENTION" | "HIGH" | "CRITICAL";
export type FinancePrivacyMode = "FULL" | "MASK_AMOUNT" | "GENERIC";
export type FinanceNotificationPreset =
  "PAYMENT_STANDARD" | "PAYMENT_IMPORTANT" | "PAYMENT_CRITICAL";

export type FinanceNotificationHistorySummary = {
  entityId: string;
  recentDeliveryCount: number;
  recentPersistentRepeatCount: number;
  lastDeliveredAt?: number;
  lastActionAt?: number;
  lastDismissedAt?: number;
};
export type CashflowForecastSignal = {
  financeBookId: string;
  currency: Money["currency"];
  horizonDays: number;
  projectedMinimumCash: Money;
  shortfallAmount: Money;
  shortfallDate: number;
};
export type FinanceTriggerConfig = {
  timezone: string;
  dueHoursThreshold: number;
  scheduledPaymentConfirmationGraceMs: number;
  statementReviewGraceMs: number;
  recurrenceLookaheadDays: number;
  repeatedNudgeThreshold: number;
  subscriptionReviewLeadDays: number;
  cashRequirement7DayThresholds: Partial<Record<Money["currency"], number>>;
  cashRequirement30DayThresholds: Partial<Record<Money["currency"], number>>;
  privacyMode: FinancePrivacyMode;
};
export const DEFAULT_FINANCE_TRIGGER_CONFIG: FinanceTriggerConfig = {
  timezone: "Europe/Istanbul",
  dueHoursThreshold: 24,
  scheduledPaymentConfirmationGraceMs: 24 * 60 * 60_000,
  statementReviewGraceMs: 24 * 60 * 60_000,
  recurrenceLookaheadDays: 30,
  repeatedNudgeThreshold: 3,
  subscriptionReviewLeadDays: 7,
  cashRequirement7DayThresholds: {},
  cashRequirement30DayThresholds: {},
  privacyMode: "FULL",
};
export type FinanceTriggerEvaluation = {
  triggerId: FinanceTriggerId;
  status: FinanceTriggerStatus;
  severity: FinanceTriggerSeverity;
  financeBookId: string;
  entityType:
    | "FINANCIAL_OBLIGATION"
    | "FINANCIAL_PAYMENT"
    | "FINANCIAL_STATEMENT"
    | "FINANCIAL_SCHEDULE"
    | "FINANCE_BOOK";
  entityId: string;
  reasonCodes: readonly string[];
  messageData: Readonly<Record<string, string | number | boolean>>;
  evaluatedAt: number;
  notificationPreset?: FinanceNotificationPreset;
  suggestedActions: readonly string[];
};
export type RequiredCashView = {
  currency: Money["currency"];
  outstanding: Money;
  obligationIds: readonly string[];
  earliestDueDate?: number;
};
export type FinanceTriggerContext = {
  financeBookId: string;
  now: number;
  obligations: readonly FinancialObligation[];
  payments: readonly FinancialPayment[];
  statements: readonly CreditCardStatement[];
  schedules: readonly FinancialSchedule[];
  notificationHistory?: readonly FinanceNotificationHistorySummary[];
  cashflowSignals?: readonly CashflowForecastSignal[];
  config?: Partial<FinanceTriggerConfig>;
};
export type FinanceAlertView = FinanceTriggerEvaluation & { title: string; detail: string };
