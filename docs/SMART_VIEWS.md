# Smart Views

Smart Views are derived Execution read models. They use canonical `ExecutionTask`
records, including the `execution_extensions` sidecar, and never persist a copy of
task truth or a computed result list.

`/views/$viewId` is a single route backed by the central registry in
`src/application/smart-views`. Its selectors reuse the Trigger Engine for NOW,
Top 3, quick wins, deadline risk, stale work and follow-ups. Waiting, blocked,
blocking, context, energy, someday and completed use canonical task fields.

The V1 deep-work rule is deliberately explicit: an actionable HIGH-energy task
with an estimate of at least 30 minutes. It is not a second priority score.

View actions dispatch canonical Execution commands. Finance records retain their
own identity and are not represented as fake tasks.
