import { createMoney, type Money } from "./money";
import { getOutstandingAmount } from "./operations";
import type {
  ExpectedCashflowItem,
  FinancialAccount,
  FinancialObligation,
  FinancialPayment,
  FinancialTransaction,
} from "./models";

export const CASHFLOW_MODEL_VERSION = "CASHFLOW_MODEL_V1";
export type CashflowScenario = "BASE" | "COMMITTED_ONLY" | "INCLUDE_ESTIMATED";
export type CashflowSourceType =
  | "OPENING_CASH"
  | "FINANCIAL_OBLIGATION"
  | "EXPECTED_CASHFLOW_ITEM";
export type CashflowItem = {
  id: string;
  sourceType: CashflowSourceType;
  sourceId?: string;
  title: string;
  direction: "INFLOW" | "OUTFLOW";
  amount: Money;
  expectedAt: number;
  confidence: ExpectedCashflowItem["confidence"] | "COMMITTED";
  dateOnly: boolean;
};
export type CashflowPoint = {
  at: number;
  openingBalance: Money;
  inflows: Money;
  outflows: Money;
  closingBalance: Money;
  sourceItems: CashflowItem[];
};
export type CashflowForecast = {
  financeBookId: string;
  currency: Money["currency"];
  start: number;
  end: number;
  openingCash: Money;
  points: CashflowPoint[];
  totalInflows: Money;
  totalOutflows: Money;
  closingCash: Money;
  minimumProjectedCash: Money;
  minimumProjectedCashAt: number;
  shortfallAmount: Money;
  shortfallAt?: number;
  assumptions: string[];
  warnings: string[];
  modelVersion: typeof CASHFLOW_MODEL_VERSION;
  generatedAt: number;
};

export function isCashflowEligible(account: FinancialAccount): boolean {
  return account.role === "ASSET" && ["BANK", "CASH"].includes(account.type) && !account.archivedAt && !account.closedAt;
}
export function getOpeningCashPosition(
  accounts: readonly FinancialAccount[],
  transactions: readonly FinancialTransaction[],
  currency: Money["currency"],
) {
  const eligible = accounts.filter((account) => isCashflowEligible(account) && account.currency === currency);
  return {
    accounts: eligible.map((account) => ({
      account,
      balance: createMoney(
        transactions.filter((transaction) => transaction.accountId === account.id).reduce((sum, transaction) => sum + transaction.amount.minorUnits, 0),
        currency,
      ),
    })),
    total: createMoney(
      eligible.reduce(
        (sum, account) => sum + transactions.filter((transaction) => transaction.accountId === account.id).reduce((value, transaction) => value + transaction.amount.minorUnits, 0),
        0,
      ),
      currency,
    ),
  };
}
function included(confidence: ExpectedCashflowItem["confidence"], scenario: CashflowScenario) {
  return scenario === "COMMITTED_ONLY" ? confidence === "COMMITTED" : scenario === "BASE" ? confidence !== "OPTIONAL" && confidence !== "ESTIMATED" : confidence !== "OPTIONAL";
}
export function buildCashflowForecast(input: {
  financeBookId: string;
  currency: Money["currency"];
  start: number;
  end: number;
  generatedAt: number;
  scenario?: CashflowScenario;
  accounts: readonly FinancialAccount[];
  transactions: readonly FinancialTransaction[];
  obligations: readonly FinancialObligation[];
  payments: readonly FinancialPayment[];
  expectedItems: readonly ExpectedCashflowItem[];
}): CashflowForecast {
  const scenario = input.scenario ?? "BASE";
  const opening = getOpeningCashPosition(input.accounts, input.transactions, input.currency).total;
  const items: CashflowItem[] = [];
  for (const obligation of input.obligations) {
    if (obligation.financeBookId !== input.financeBookId || obligation.status === "CANCELLED" || obligation.dueDate < input.start || obligation.dueDate > input.end) continue;
    const outstanding = getOutstandingAmount(obligation, [...input.payments]);
    if (outstanding.currency === input.currency && outstanding.minorUnits > 0)
      items.push({ id: `obligation:${obligation.id}`, sourceType: "FINANCIAL_OBLIGATION", sourceId: obligation.id, title: obligation.title, direction: "OUTFLOW", amount: outstanding, expectedAt: obligation.dueDate, confidence: "COMMITTED", dateOnly: obligation.metadata.dueDateHasTime !== true });
  }
  for (const item of input.expectedItems) {
    if (item.financeBookId !== input.financeBookId || item.status !== "ACTIVE" || item.amount.currency !== input.currency || item.expectedAt < input.start || item.expectedAt > input.end || !included(item.confidence, scenario)) continue;
    items.push({ id: `expected:${item.id}`, sourceType: "EXPECTED_CASHFLOW_ITEM", sourceId: item.id, title: item.title, direction: item.direction, amount: item.amount, expectedAt: item.expectedAt, confidence: item.confidence, dateOnly: item.metadata.dateOnly === true });
  }
  const groups = new Map<number, CashflowItem[]>();
  for (const item of items) groups.set(item.expectedAt, [...(groups.get(item.expectedAt) ?? []), item]);
  let balance = opening.minorUnits;
  let minimum = balance;
  let minimumAt = input.start;
  let inflows = 0;
  let outflows = 0;
  const points = [...groups.entries()].sort(([a], [b]) => a - b).map(([at, bucket]) => {
    const incoming = bucket.filter((item) => item.direction === "INFLOW").reduce((sum, item) => sum + item.amount.minorUnits, 0);
    const outgoing = bucket.filter((item) => item.direction === "OUTFLOW").reduce((sum, item) => sum + item.amount.minorUnits, 0);
    const point = { at, openingBalance: createMoney(balance, input.currency), inflows: createMoney(incoming, input.currency), outflows: createMoney(outgoing, input.currency), closingBalance: createMoney(balance + incoming - outgoing, input.currency), sourceItems: bucket };
    balance = point.closingBalance.minorUnits;
    inflows += incoming;
    outflows += outgoing;
    if (balance < minimum) { minimum = balance; minimumAt = at; }
    return point;
  });
  return { financeBookId: input.financeBookId, currency: input.currency, start: input.start, end: input.end, openingCash: opening, points, totalInflows: createMoney(inflows, input.currency), totalOutflows: createMoney(outflows, input.currency), closingCash: createMoney(balance, input.currency), minimumProjectedCash: createMoney(minimum, input.currency), minimumProjectedCashAt: minimumAt, shortfallAmount: createMoney(Math.max(0, -minimum), input.currency), shortfallAt: minimum < 0 ? minimumAt : undefined, assumptions: [scenario === "BASE" ? "COMMITTED ve EXPECTED kayıtlar dahil edilir." : scenario === "COMMITTED_ONLY" ? "Yalnızca COMMITTED kayıtlar dahil edilir." : "COMMITTED, EXPECTED ve ESTIMATED kayıtlar dahil edilir.", "Tarihsiz saat bilgileri gün seviyesinde değerlendirilir."], warnings: points.some((point) => point.sourceItems.some((item) => item.dateOnly)) ? ["DATE_ONLY_GRANULARITY"] : [], modelVersion: CASHFLOW_MODEL_VERSION, generatedAt: input.generatedAt };
}
