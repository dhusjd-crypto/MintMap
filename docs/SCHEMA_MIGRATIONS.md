# Schema Migrations

Canonical startup reads the schema meta record, checks the durable migration
journal, and applies only an exact `fromVersion -> toVersion` path. Each
migration is journaled through `PLANNED`, `PREPARING`, `BACKUP_CREATED`,
`RUNNING`, `VALIDATING`, and `COMPLETED`. A failure is `FAILED`; later
migrations do not run and the next startup enters a recoverable error state.

The initial canonical schema creates stores but does not migrate legacy tasks or
Finance data. Legacy `Todo.steps` migration remains owned by `mindmap-store`.
