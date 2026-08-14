# Notification Escalation

Critical trigger severity or a deadline within two hours escalates to
`CRITICAL`. High severity can promote a normal policy to `PERSISTENT`.
Repeated snoozes may promote according to policy. Stable reason codes explain
deadline, overdue, persistent, and snooze escalation. No escalation creates an
unbounded loop.
