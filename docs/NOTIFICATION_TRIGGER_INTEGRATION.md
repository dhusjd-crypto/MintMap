# Trigger Integration

The application layer is the only intended direction:

`TriggerEvaluation -> Notification decision -> adapter`

The engine can consume T01/T02/T03, deadline T04-T08, T11, T13/T14, planner
T15/T16/T19, T20, T23, T24, and T25 facts through typed trigger input. Digest
and aggregation callers should pass one dedupe key per logical condition;
selection is deterministic and critical levels sort first. Trigger Engine does
not import Notification Engine.
