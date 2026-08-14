# Canonical Schema

`CANONICAL_SCHEMA_VERSION = 1` is independent from application, sync, and
feature-registry versions. The IndexedDB physical version is 2 because the
notification stores were added additively without changing existing entity
payload semantics. Stores include `meta`, `execution_extensions`, the Finance
stores, `notification_intents`, `notification_history`,
`notification_schedule`, `migration_journal`, and `persistence_operations`.

Finance amounts use `{ minorUnits, currency }`; no floating point currency
value is authoritative. Timestamps are UTC instants represented as epoch
milliseconds. Date-only financial concepts remain explicit domain values.

Indexes are limited to actual query paths: FinanceBook/account/date/status and
obligation/dueDate/status, payment obligation, statement book/card, and
Execution extension state/dueAt/followUpAt.
