# Re-entry Plan

`createReEntryPlan` is a deterministic, bounded read model. It includes at most three critical
actionable task IDs, due waiting follow-ups, one quick win, stale project IDs, and major deadline
risks. It does not move tasks, resolve waiting states, duplicate IDs, dump the backlog, or send
notifications. The Notification and Routines contexts may later consume this plan.
