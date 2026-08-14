# Relative Reminders

Relative reminders reference an anchor (`DUE_AT`, `DO_AT`, `REMIND_AT`,
`FOLLOW_UP_AT`, `START_AT`, or `FINANCIAL_DUE_DATE`) plus an offset. The engine
returns a scheduled intent and never mutates the anchor. Missing, past, and
expired anchors are ignored deterministically; missed delivery policy remains
adapter/application work.
