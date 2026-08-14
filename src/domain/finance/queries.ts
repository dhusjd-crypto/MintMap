import type { Clock } from "@/lib/architecture/clock";
import { isObligationOverdue } from "./operations";
import type { FinancialObligation, FinancialPayment, FinancialTransaction } from "./models";

export const getOutstandingObligations = (items: FinancialObligation[]) =>
  items.filter((item) => !["PAID", "CANCELLED"].includes(item.status));
export const getOverdueObligations = (items: FinancialObligation[], clock: Clock) =>
  items.filter((item) => isObligationOverdue(item, clock));
export const getUpcomingObligations = (items: FinancialObligation[], until: number) =>
  items.filter((item) => item.dueDate <= until && !["PAID", "CANCELLED"].includes(item.status));
export const getAccountTransactions = (items: FinancialTransaction[], accountId: string) =>
  items.filter((item) => item.accountId === accountId);
export const getObligationPayments = (items: FinancialPayment[], obligationId: string) =>
  items.filter((item) => item.obligationId === obligationId);
