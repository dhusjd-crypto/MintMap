# NOW Mode

NOW selection is deterministic for a given task set, clock, timezone, Trigger
configuration, and Planner context. Trigger Engine runs before any optional AI
proposal. The read model exposes the score, reason codes, human-readable
reason summaries, duration, deadline, and node context so the selection can be
reviewed rather than treated as an opaque recommendation.

The first version deliberately avoids automatic task completion, automatic
deadline changes, and hidden rescheduling. `Snooze` is an explicit task
command. `Cannot do today` returns a decision-required result until a concrete
user choice is supplied.
