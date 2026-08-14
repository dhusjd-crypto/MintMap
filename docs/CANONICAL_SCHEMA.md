# Canonical Schema

`CANONICAL_SCHEMA_VERSION = 1` is independent from application, sync, and
feature-registry versions. Stores are `meta`, `execution_extensions`, the
Finance stores, `migration_journal`, and `persistence_operations`.

Finance amounts use `{ minorUnits, currency }`; no floating point currency
value is authoritative. Timestamps are UTC instants represented as epoch
milliseconds. Date-only financial concepts remain explicit domain values.

Indexes are limited to actual query paths: FinanceBook/account/date/status and
obligation/dueDate/status, payment obligation, statement book/card, and
Execution extension state/dueAt/followUpAt.
