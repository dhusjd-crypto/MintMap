# Focus Mode

Focus Mode is a single-task surface at `/focus/:taskId`. It supports `FLOW`,
`COUNTDOWN`, and `POMODORO` modes. A session is not a task completion: ending a
focus session records actual active minutes and leaves task completion to the
explicit task command.

Only one active or paused session may exist at a time. The UI derives elapsed
time from `startedAt`, `lastResumedAt`, `pausedAt`, and
`accumulatedActiveMs`; it does not increment a counter as authority. A stale
active session is paused on recovery and marked for review so unknown time is
never silently counted.
