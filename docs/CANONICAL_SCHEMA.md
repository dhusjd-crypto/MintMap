# Canonical Schema

`CANONICAL_SCHEMA_VERSION = 1` is independent from application, sync, and
feature-registry versions. The IndexedDB physical version is 7. Version 2
added notification stores and version 3 added `focus_sessions` additively
without changing existing entity payload semantics. Stores include `meta`,
`execution_extensions`, the Finance stores, `notification_intents`,
`notification_history`, `notification_schedule`, `focus_sessions`,
`routine_sessions`, `rollover_decisions`, Capture stores, `migration_journal`, and
`persistence_operations`.

Version 6 adds additive `finance_capture_proposals`, `finance_import_batches`,
`finance_import_rows`, and `reconciliation_sessions` stores. Existing payloads
and Finance records are untouched.

Version 7 adds `capture_document_content` additively. It stores a captured file
Blob only behind the Capture boundary, keyed by `CaptureDocumentRef.id`.
Finance records retain just document references and provenance; binary OCR input
is never embedded in a statement, payment, or transaction record.

Version 8 adds `expected_cashflow_items`, `budgets`, `budget_allocations`, and
`financial_goals` additively. They are planning intent and derived-forecast inputs,
not ledger transactions. Existing Finance, Capture, Execution and Blob records are
unchanged and remain covered by the existing backup/journal migration contract.

Finance amounts use `{ minorUnits, currency }`; no floating point currency
value is authoritative. Timestamps are UTC instants represented as epoch
milliseconds. Date-only financial concepts remain explicit domain values.

Indexes are limited to actual query paths: FinanceBook/account/date/status and
obligation/dueDate/status, payment obligation, statement book/card, and
Execution extension state/dueAt/followUpAt.

Phase 13 adds no physical store or schema version. Recurrence occurrence audit
uses additive `FinancialObligation.metadata` fields (`scheduleId`,
`recurrenceOccurrenceKey`, `generatedAt`), preserving the v5 backup and
migration contract.
