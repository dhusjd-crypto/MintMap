export type FinanceEventName =
  | "FinanceBookCreated"
  | "FinancialAccountCreated"
  | "FinancialTransactionRecorded"
  | "FinancialTransferRecorded"
  | "FinancialObligationCreated"
  | "FinancialObligationUpdated"
  | "FinancialObligationPaid"
  | "FinancialObligationCancelled"
  | "PaymentScheduled"
  | "PaymentConfirmed"
  | "PaymentFailed"
  | "CreditCardStatementCreated"
  | "CreditCardStatementConfirmed"
  | "StatementReconciled";
export type FinanceEvent = {
  id: string;
  name: FinanceEventName;
  aggregateId: string;
  occurredAt: number;
  schemaVersion: 1;
  payload: Record<string, unknown>;
};
let sequence = 0;
export function createFinanceEvent(
  name: FinanceEventName,
  aggregateId: string,
  occurredAt: number,
  payload: Record<string, unknown> = {},
): FinanceEvent {
  sequence += 1;
  return {
    id: `${name}:${aggregateId}:${occurredAt}:${sequence}`,
    name,
    aggregateId,
    occurredAt,
    schemaVersion: 1,
    payload,
  };
}
