# Trigger Catalog

| ID | Meaning | Status |
|---|---|---|
| T01 | Morning Top 3 calculation | IMPLEMENTED (evaluation) |
| T02 | Best NOW calculation | IMPLEMENTED |
| T03 | Adaptive 2–3 hour check | NOT_EVALUATED without session context |
| T04–T08 | 7d, 3d, tomorrow, today, hours deadline bands | IMPLEMENTED |
| T09–T10 | stale and severely stale | IMPLEMENTED |
| T11 | waiting follow-up due | IMPLEMENTED |
| T12 | dependency completion/release signal | CONTRACT ONLY; no event consumer |
| T13–T14 | repeated/excessive snooze | IMPLEMENTED |
| T15–T16 | capacity exceeded/deadline risk | PARTIAL; explicit Planner context required |
| T17–T19 | free slot, cancelled meeting, replan | PARTIAL; explicit verified Calendar signals required |
| T20 | return after inactivity | IMPLEMENTED (context signal) |
| T21 | stale project | IMPLEMENTED (context signal) |
| T22 | task blocks downstream work | IMPLEMENTED |
| T23 | too many waiting items | IMPLEMENTED |
| T24 | quick win fits short slot | IMPLEMENTED |
| T25 | evening/tomorrow planning | IMPLEMENTED (evaluation; no timer) |

Trigger severity is separate from notification policy. Phase 6 does not deliver notifications.
