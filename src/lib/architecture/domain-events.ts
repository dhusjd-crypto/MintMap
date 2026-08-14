export type DomainEventName =
  | "TaskCreated"
  | "TaskUpdated"
  | "TaskStarted"
  | "TaskCompleted"
  | "TaskReopened"
  | "TaskCancelled"
  | "TaskSnoozed"
  | "TaskBecameReady"
  | "TaskBecameBlocked"
  | "TaskBecameWaiting"
  | "DependencyCompleted"
  | "FollowUpBecameDue"
  | "DeadlineApproaching"
  | "ProjectBecameStale"
  | "ProjectHasNoNextAction"
  | "DailyCapacityExceeded"
  | "CalendarAvailabilityChanged"
  | "UserReturnedAfterInactivity"
  | "FinancialObligationCreated"
  | "FinancialObligationUpdated"
  | "FinancialObligationDueSoon"
  | "FinancialObligationPaid"
  | "FinancialObligationOverdue"
  | "CreditCardStatementCaptured"
  | "StatementReconciled"
  | "ExpectedCashShortfallDetected"
  | "BudgetThresholdReached"
  | "RecurringPaymentGenerated"
  | "ExpectedReplyReceived";

export type DomainEvent<TPayload = unknown> = {
  id: string;
  name: DomainEventName;
  aggregateId: string;
  occurredAt: number;
  schemaVersion: 1;
  payload: TPayload;
};

let sequence = 0;

export function createDomainEvent<TPayload>(input: {
  name: DomainEventName;
  aggregateId: string;
  occurredAt: number;
  payload: TPayload;
}): DomainEvent<TPayload> {
  sequence += 1;
  return {
    ...input,
    id: `${input.name}:${input.aggregateId}:${input.occurredAt}:${sequence}`,
    schemaVersion: 1,
  };
}

export type DomainEventSink = (event: DomainEvent) => void;
