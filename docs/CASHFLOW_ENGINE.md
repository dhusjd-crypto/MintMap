# Cashflow Engine

`CASHFLOW_MODEL_V1` is a deterministic, currency-scoped forecast. It reads only
canonical ledger balances, unpaid obligation outstanding amounts, and explicit
ExpectedCashflowItems. It never creates transactions or writes forecast events to
the ledger.

Opening cash includes only active BANK and CASH asset accounts. Credit cards,
loans and investments are excluded. A Bank -> Card transfer reduces liquidity but
is not a second expense. Scheduled payments refine execution intent but never add a
second obligation outflow. FIN-T15 consumes the resulting signal; it does not
calculate a forecast itself.
