# Routine Engine

Phase 10 routines are deterministic application workflows. `RoutineSession`
tracks review progress and is separate from task completion. Due evaluation is
local-date and configured-window based; it is idempotent by
`ROUTINE_TYPE:LOCAL_DATE`. Notification delivery remains owned by the
Notification Engine.
