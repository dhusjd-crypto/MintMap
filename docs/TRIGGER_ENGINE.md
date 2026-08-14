# Deterministic Trigger Engine

Phase 6 implements a pure, read-only Trigger Engine in `src/engines/trigger`.
It consumes canonical `ExecutionTask` records and an explicit `TriggerContext`, then returns
versioned scores, stable reasons, and trigger signals. It never mutates tasks, persists data,
sends notifications, calls Google/Drive/AI, or reads Finance persistence.

The public entry points are `TriggerEngine.evaluateTask`, `evaluateTasks`, and `evaluateSystem`.
Application queries in `src/application/queries/trigger-queries.ts` are the only repository bridge.
UI code must consume those queries rather than reimplementing scoring.

Eligibility excludes `WAITING`, `BLOCKED`, `SOMEDAY`, `DONE`, `CANCELLED`, future `startAt`,
incomplete dependencies, and unorganized `INBOX` items. A due waiting follow-up is surfaced as
`T11 FOLLOW_UP_DUE` but remains WAITING. Missing capacity/calendar data is `NOT_EVALUATED`.

Scores are bounded to 0..100 and use `TRIGGER_SCORE_V1`. Tie-breaking is score descending,
hard deadline ascending, manual priority, older creation time, then lexical ID. All score
contributions are returned as stable, human-readable reasons.
