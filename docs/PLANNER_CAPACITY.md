# Planner Capacity V1

Capacity is calculated from the union of explicit `PlanningWindow` intervals. Overlapping
windows are merged, fixed events are subtracted once, and a configurable buffer policy reserves
capacity. V1 supports no buffer, fixed minutes, or percentage of usable capacity; the default
configuration is 10% but is a policy value, not a hidden workday assumption.

Remaining task work is `estimatedMinutes - completed TimeBlock minutes`. `actualMinutes` is not
silently subtracted because its semantic authority is not yet defined for planning. A completed
TimeBlock therefore records completed work while the Task may remain unfinished.

`DailyCapacity` exposes available, fixed, buffer, planned, remaining, utilization, overcommit,
estimated finish, warnings, and deadline risks. No future availability is invented.
