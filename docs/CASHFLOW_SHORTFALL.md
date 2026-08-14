# Cashflow Shortfall

The forecast minimum is calculated per currency from liquid opening cash and
ordered forecast items. A negative minimum produces the exact shortfall amount and
date bucket. It becomes FIN-T15 through `CashflowForecastSignal`; no current-balance
minus-obligations shortcut is treated as forecast truth.
