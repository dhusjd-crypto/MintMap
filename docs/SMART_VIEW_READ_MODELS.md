# Smart View Read Models

`smartViewsApplication.queries` reads `CanonicalExecutionTaskRepository` and
passes canonical tasks to pure Smart View selectors. This preserves execution
extension fields that the legacy Todo shape cannot carry, such as WAITING,
BLOCKED, follow-up, context and energy requirement.

The route waits for the application query and renders its result; React does not
recompute ranking or financial conditions.
