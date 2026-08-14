# Notification Actions

Actions are contracts, not direct mutations. `handleNotificationAction` calls
an application handler and returns `SUCCESS`, `STALE`, `NOT_SUPPORTED`, or
`ERROR`. START/DONE must be connected to the existing application commands;
snooze handlers schedule a new reminder without moving `dueAt`.

Finance actions such as `MARK_PAID` are placeholders and must pass through the
Finance confirmation workflow.
