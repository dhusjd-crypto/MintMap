# Trigger Context Contract

`TriggerContext` requires `now` and an IANA `timezone`. Capacity, calendar, active-session,
project-health, and re-entry values are optional and authoritative only when supplied by their
own future bounded context. Missing values remain `NOT_EVALUATED`; the engine does not inspect
browser APIs, localStorage, calendar clients, or Finance records.

Calendar signals must be explicitly marked `verified`. Planner and Calendar adapters will later
map their ports to this contract. The score model and configuration are versioned so a future
change can coexist with historical evaluations.
