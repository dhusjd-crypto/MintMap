# Execution Actions

Command Center actions dispatch through `executionExperience.commands` and
then the existing task application commands. The surface may not mutate a
legacy `Todo` directly.

Supported actions are `START`, `DONE`, `SNOOZE`, `MOVE_TO_WAITING`,
`CANNOT_DO_TODAY`, `OPEN_DETAILS`, and `FOCUS`. The cannot-do action is safe by
default and returns `REQUIRES_DECISION`; it does not hide, delete, or silently
reschedule a task.
