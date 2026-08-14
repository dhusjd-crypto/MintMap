# Focus Session Contract

`FocusSession` is persisted in the additive `focus_sessions` canonical store
at physical IndexedDB version 3 and payload schema version 1. The record keeps
the task ID, mode, status, timestamps, planned minutes, accumulated active
milliseconds, interruption reason, and stale-recovery marker.

Transitions are `ACTIVE -> PAUSED -> ACTIVE`, then `COMPLETED` or `CANCELLED`.
Completed sessions are immutable from the service API. Persistence envelopes,
backup, checksum, quarantine, and restore rules apply unchanged.
