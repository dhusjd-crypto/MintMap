# Domain Events

Events are lightweight typed facts, not a global enterprise event bus. Producers emit after a validated state transition; consumers may derive projections, schedule work, or notify. Events do not replace repositories and are not the source of truth.

## Execution events

`TaskCreated`, `TaskUpdated`, `TaskStarted`, `TaskCompleted`, `TaskReopened`, `TaskCancelled`, `TaskSnoozed`, `TaskBecameReady`, `TaskBecameBlocked`, `TaskBecameWaiting`, `DependencyCompleted`, `FollowUpBecameDue`, `DeadlineApproaching`, `ProjectBecameStale`, `ProjectHasNoNextAction`, `UserReturnedAfterInactivity`.

## Planning and system events

`DailyCapacityExceeded`, `CalendarAvailabilityChanged`, `ExpectedReplyReceived`.

## Finance events

`FinancialObligationCreated`, `FinancialObligationUpdated`, `FinancialObligationDueSoon`, `FinancialObligationPaid`, `FinancialObligationOverdue`, `CreditCardStatementCaptured`, `StatementReconciled`, `ExpectedCashShortfallDetected`, `BudgetThresholdReached`, `RecurringPaymentGenerated`.

Phase 4 defines a separate Finance event contract for `FinanceBookCreated`, `FinancialAccountCreated`, `FinancialTransactionRecorded`, `FinancialTransferRecorded`, `FinancialObligationCreated`, `FinancialObligationUpdated`, `FinancialObligationPaid`, `FinancialObligationCancelled`, `PaymentScheduled`, `PaymentConfirmed`, `PaymentFailed`, `CreditCardStatementCreated`, `CreditCardStatementConfirmed`, and `StatementReconciled`. No trigger, reminder, or execution consumer is attached.

Phase 13 derives read-only Finance trigger facts from those canonical records. Recurrence generation records `RecurringFinancialObligationGenerated` provenance in the generated obligation metadata. Finance signals are then eligible for Notification application mapping; they never send a notification or mutate an Execution task directly.

## Contract shape

Every event has `id`, `name`, `occurredAt`, `aggregateId`, `schemaVersion`, and a typed payload. Consumers must be idempotent. External events are translated at the adapter boundary and never trusted without validation.

## Phase 2/3 adoption

Phase 6 defines trigger evaluations as read-only derived signals. It does not add a dispatcher
consumer or persist events. Future Planner, Calendar, Notification, and Finance adapters may
translate their verified events into `TriggerContext`; the Trigger Engine remains the scorer and
never becomes an event delivery system.

Phase 7 keeps planning results read-only in the application layer. A future persisted plan or
calendar change event must enter through a Planning port; the Planner does not emit notifications
or mutate task truth.

Phase 8 adds a platform-independent Notification Engine. Notification decisions consume trigger
facts through the application boundary and may schedule or cancel intents, but adapters own
delivery and notification actions route back through application commands. Notification policy
does not mutate task or Finance truth.

The task command boundary now emits validated lifecycle facts from the Execution Domain: `TaskCreated`, `TaskUpdated`, `TaskStarted`, `TaskCompleted`, `TaskReopened`, `TaskCancelled`, `TaskSnoozed`, `TaskBecameWaiting`, and `TaskBecameReady` where those operations are used. The dispatcher is local and synchronous; no event is persisted or sent over the network. No Trigger, Finance, Planner, or Notification consumer is attached yet.

Phase 9 keeps focus sessions as canonical records rather than introducing an
event bus. A future adapter may project `FocusSessionStarted`,
`FocusSessionPaused`, `FocusSessionResumed`, `FocusSessionCompleted`, and
`FocusSessionCancelled`; the current Focus service persists transitions and
updates task actual minutes through the application command boundary.

Phase 10 defines routine facts for future consumers: `RoutineStarted`,
`RoutineCompleted`, `RoutineSkipped`, `MorningPlanCompleted`,
`MiddayRecalibrationCompleted`, `EveningShutdownCompleted`,
`TomorrowPlanPrepared`, `WeeklyReviewCompleted`, `ReEntryCompleted`, and
`RolloverDecisionRecorded`. The current application persists routine state and
does not dispatch native notifications directly.
## Capture events

Capture emits `CaptureCreated`, `CaptureProposalGenerated`,
`CaptureReviewRequired`, `CaptureConfirmed`, `CaptureRejected`,
`CaptureFailed`, `TaskCreatedFromCapture` and `DocumentAttachedToCapture`
after persistence succeeds. Capture events describe ingestion; Execution
events remain authoritative for task state.
