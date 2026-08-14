# Execution Read Models

`ExecutionNowView` is a projection with `primary`, `alternatives`, `top3`,
`quickWins`, `waitingFollowUps`, `signals`, `capacity`, `currentSlot`, and an
explicit `emptyReason`. Its values are derived at query time from canonical
task records and deterministic engines.

Choice helpers accept an injected `RandomSource` for Task Jar behavior. The
eligible candidate set is calculated before randomness, so blocked, completed,
or otherwise ineligible tasks cannot be selected accidentally.
