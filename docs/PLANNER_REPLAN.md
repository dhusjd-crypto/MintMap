# Planner Replanning V1

`replanDay` preserves existing blocks by ID, returns a `PlanDiff`, and reports additions,
removals, movement, and locked-block conflicts. Manual `LOCKED` blocks always win. The default
lock horizon treats the next two hours as effectively locked; today is soft-stable and future
work is flexible. This policy is configurable and does not automatically move task deadlines.

T15 receives capacity values through `createPlannerQueries().toTriggerContext`. T16 receives
structured per-task deadline deficits when explicit windows exist. T19 receives a verified
schedule-change signal from the application planning coordinator. T17/T18 remain partial until
the Calendar adapter supplies real verified signals.
