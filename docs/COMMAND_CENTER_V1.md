# Command Center V1

Command Center is the first application-level execution experience. It is a
calm, focused projection for deciding what to do next, not a replacement for
Mind Map, Tasks, Calendar, or Finance screens.

The initial contract is intentionally small: NOW, next two, top three, quick
wins, waiting follow-ups, important Trigger signals, and optional capacity.
The route is available at `/command-center`; feature flags are
`commandCenterV1` and `focusModeV1`.

Phase 16 retains this stable route and progressively adds the V2 composition
read model. See `COMMAND_CENTER_V2.md`; V2 composes source-owned Execution and
Finance signals without moving their rules into React.
