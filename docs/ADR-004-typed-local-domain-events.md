# ADR-004: Typed Local Domain Events

Status: accepted

`LocalDomainEventDispatcher` is an in-process, synchronous, typed dispatcher. It has no network, broker, persistence, or hidden global subscription. Commands emit small identity/timestamp payloads; consumers may be added later without turning events into a second database.
