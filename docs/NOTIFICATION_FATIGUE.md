# Notification Fatigue

Fatigue is evaluated from bounded notification history. Cooldown is keyed by
source/entity/trigger, entity fatigue counts recent notices for one entity, and
global fatigue applies a non-critical hourly budget. Critical notifications are
not suppressed by low-value entity noise, but their own repeat and cooldown
limits remain bounded.
