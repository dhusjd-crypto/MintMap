# Execution Experience

Phase 9 execution experience is an application-level projection. It combines
Execution task truth with Trigger signals and optional Planner capacity. The
React surface renders this read model; it does not score, schedule, complete,
or mutate tasks directly.

`/command-center` presents one primary NOW task, up to two alternatives, top
three planned tasks, quick wins, waiting follow-ups, important signals, and
capacity when Planner data is available. Missing Planner, Calendar, AI, or
notification adapters are explicit unavailable states, not reasons to block
basic task work.

Actions are application commands: start, done, snooze, move to waiting, and
safe cannot-do-today decision handling. Every task remains one canonical task
record; the command center is only a projection.
