# Finance Notification Policies

Finance-ready presets map `PAYMENT_STANDARD` to `NORMAL`,
`PAYMENT_IMPORTANT` to `PERSISTENT`, and `PAYMENT_CRITICAL` to `CRITICAL`.
Finance remains authoritative for due dates, amounts, status, and payment
confirmation. Notification privacy modes are `FULL`, `MASK_AMOUNT`, and
`GENERIC`. `MARK_PAID` never marks an obligation paid by itself.

Phase 13 maps Finance conditions into the shared Notification Engine, which
continues to own quiet hours, cooldown, delivery dedupe and fatigue. Finance
signals are facts; they never directly call a browser or external adapter.
