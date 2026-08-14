# Domain Events

Events are lightweight typed facts, not a global enterprise event bus. Producers emit after a validated state transition; consumers may derive projections, schedule work, or notify. Events do not replace repositories and are not the source of truth.

## Execution events

`TaskCreated`, `TaskUpdated`, `TaskStarted`, `TaskCompleted`, `TaskReopened`, `TaskCancelled`, `TaskSnoozed`, `TaskBecameReady`, `TaskBecameBlocked`, `TaskBecameWaiting`, `DependencyCompleted`, `FollowUpBecameDue`, `DeadlineApproaching`, `ProjectBecameStale`, `ProjectHasNoNextAction`, `UserReturnedAfterInactivity`.

## Planning and system events

`DailyCapacityExceeded`, `CalendarAvailabilityChanged`, `ExpectedReplyReceived`.

## Finance events

`FinancialObligationCreated`, `FinancialObligationUpdated`, `FinancialObligationDueSoon`, `FinancialObligationPaid`, `FinancialObligationOverdue`, `CreditCardStatementCaptured`, `StatementReconciled`, `ExpectedCashShortfallDetected`, `BudgetThresholdReached`, `RecurringPaymentGenerated`.

## Contract shape

Every event has `id`, `name`, `occurredAt`, `aggregateId`, `schemaVersion`, and a typed payload. Consumers must be idempotent. External events are translated at the adapter boundary and never trusted without validation.
