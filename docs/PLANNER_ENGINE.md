# Planner and Daily Capacity Engine

Phase 7 adds a pure Planning bounded context under `src/domain/planning` and
`src/engines/planner`. `PLANNER_MODEL_V1` consumes explicit availability windows and
application-supplied `PlanningCandidate` priority values. It does not calculate TriggerScore,
mutate Execution tasks, call Calendar/AI/Finance/Notification adapters, or persist plans.

The canonical scheduling unit is `TimeBlock`, which references a canonical `taskId`; chunks
never create child tasks. `DailyPlan` is a read/result model in V1. Persistence is intentionally
not added because no persistence requirement exists yet; schema remains at version 1.

Tie-breaking is supplied priority descending, earlier hard deadline, planned `doAt`, shorter
duration, then lexical task ID. Every unscheduled candidate carries a stable reason. Missing
windows and missing estimates are explicit conditions rather than guessed defaults.
