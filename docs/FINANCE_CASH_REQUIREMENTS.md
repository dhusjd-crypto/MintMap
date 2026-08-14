# Finance Cash Requirements

`GetRequiredCash` sums only unpaid canonical obligation balances in a selected 7 or 30 day local-calendar horizon. Values stay separated by currency and partially confirmed payments reduce the requirement.

This is not cashflow forecasting. FIN-T15 is `NOT_EVALUATED` without an external `CashflowForecastSignal`; current account balance minus obligations is deliberately not treated as a forecast.
