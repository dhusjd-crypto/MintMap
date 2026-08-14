# Finance Trigger Engine

`src/application/finance/triggers` is a pure, deterministic evaluator over canonical Finance records. Finance owns amount, due date, statement and payment truth; this engine only produces explainable condition signals. React renders `FinanceAlertView` and never derives payment status itself.

Due evaluation uses local calendar dates from the supplied timezone. Date-only obligations can raise today/overdue signals but never receive an invented hourly cutoff. Only `metadata.dueDateHasTime === true` enables FIN-T05.

The shared Notification Engine owns delivery, quiet-hours, cooldown and fatigue. `decideFinanceNotification` maps a Finance alert into that existing engine without letting Finance call an adapter.
## Cashflow signal

Phase 15 supplies FIN-T15 from `CASHFLOW_MODEL_V1`. The evaluator receives a
currency-scoped `CashflowForecastSignal`; it reports `TRIGGERED` for a real
shortfall, `NOT_TRIGGERED` for a generated forecast without deficit, and
`NOT_EVALUATED` only when no forecast context can be produced.
