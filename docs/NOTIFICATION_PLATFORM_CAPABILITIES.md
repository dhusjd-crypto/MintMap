# Platform Capabilities

`NotificationAdapter` exposes permission, scheduling, cancellation, update,
and capability methods. The in-memory adapter is complete for tests. The
browser adapter reports that actions, persistent delivery, exact scheduling,
and guaranteed scheduled delivery are unsupported; it only wraps the existing
best-effort Notification API. Native Android and Windows adapters are future
phases.
