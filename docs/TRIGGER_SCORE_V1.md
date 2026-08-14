# Trigger Score V1

`TRIGGER_SCORE_V1` is deterministic and centralized in `src/engines/trigger/scoring.ts`.
The nominal positive weights are deadline 30, importance 20, blocking 15, planned today 10,
staleness 12, repeated snooze 10, active continuity 8, and slot fit 8. Notification fatigue
is -15 and a task that does not fit an explicitly supplied slot is -10. The final score is
rounded and clamped to 0..100. A missing signal contributes zero and produces an explanatory
reason; it is never guessed.

Importance combines manual priority with the normalized strategic weight and impact fields once.
Deadline pressure uses `dueAt` only. `doAt` means planned work, not a deadline. Staleness uses
`lastTouchedAt`; scoring is observational and never updates it. Slot fit requires explicit
available minutes and respects estimate/minimum chunk/splittable semantics.
