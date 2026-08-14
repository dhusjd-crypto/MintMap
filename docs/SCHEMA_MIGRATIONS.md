# Schema Migrations

Canonical startup reads the schema meta record, checks the durable migration
journal, and applies only an exact `fromVersion -> toVersion` path. Each
migration is journaled through `PLANNED`, `PREPARING`, `BACKUP_CREATED`,
`RUNNING`, `VALIDATING`, and `COMPLETED`. A failure is `FAILED`; later
migrations do not run and the next startup enters a recoverable error state.

The initial canonical schema creates stores but does not migrate legacy tasks or
Finance data. Legacy `Todo.steps` migration remains owned by `mindmap-store`.

Phase 8 adds notification stores additively at IndexedDB physical version 2;
existing canonical entity payloads remain schema version 1. Notification
intents, history, and adapter schedule metadata use the same envelope, backup,
and recovery rules. No D1 or Drive migration is performed.

Phase 9 adds the `focus_sessions` store additively at physical version 3.
Focus sessions use schema version 1, retain timestamps needed to reconstruct
active time, and are covered by the same backup, checksum, quarantine, and
restore paths. Existing tasks and notification records are untouched.

Phase 10 adds `routine_sessions` and `rollover_decisions` additively at
physical version 4. Both use schema version 1 and store IDs and decisions,

Phase 11 adds physical version 5 stores `capture_items`, `capture_proposals`
and `capture_document_refs`. The migration is additive and keeps all existing
Execution, Finance, Planner, Notification, Focus and Routine records intact.
Legacy task snapshots remain unchanged. Existing data and external D1/Drive
behavior are unchanged.

Phase 14C adds physical version 7 store `capture_document_content` after the
additive Phase 14 version 6 Finance review/import stores. The new store keeps
captured document Blobs in Capture infrastructure so local OCR can be retried
without placing binary content in the Finance domain. Existing records are
unchanged; normal backup, journal, validation, and restore rules apply.
