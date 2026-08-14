# Notification Engine

Phase 8 introduces a deterministic, platform-independent Notification Engine.
Trigger Engine supplies facts and severity; Notification Engine decides whether
to send, schedule, defer, suppress, or cancel a `NotificationIntent`. Planner,
Execution, Finance, and adapters remain separate authorities.

The pure entry point is `decideNotification`. It applies escalation, dedupe,
cooldown, fatigue, quiet/working hours, weekend policy, expiration, and adapter
capabilities. It never calls a browser, Android, Windows, Calendar, Finance, or
AI API. Existing browser reminders remain a legacy compatibility path.

The application coordinator applies decisions to an adapter and routes actions
to command handlers. This keeps `START`, `DONE`, and snooze behavior outside the
notification infrastructure.
