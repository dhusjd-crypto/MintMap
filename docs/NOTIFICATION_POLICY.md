# Notification Policy

The three configurable presets are:

- `NORMAL`: one notification, 60-minute cooldown, 24-hour expiration.
- `PERSISTENT`: 30-minute cooldown, at most six repeats in 24 hours.
- `CRITICAL`: 15-minute cooldown, at most four repeats in six hours; it may
  pass quiet hours when the configured policy allows it.

Trigger severity is not notification level. Escalation maps facts into a level;
it does not recompute TriggerScore or change source truth.
