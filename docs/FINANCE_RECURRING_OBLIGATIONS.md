# Recurring Obligations

Phase 13 reuses canonical `FinancialSchedule`. Supported V1 rules are `WEEKLY`, `MONTHLY`, `YEARLY` and `INTERVAL_DAYS:n`. The generation horizon is 30 days by default. Occurrences use a stable `scheduleId:YYYY-MM-DD` key in obligation metadata, so generation is idempotent.

Monthly day 29–31 schedules use `CLAMP_TO_LAST_DAY`; JavaScript date overflow is never used as policy. First generation advances only from the current period forward and never floods historical data.
