# Finance UI V1

`/finance` provides a compact shell with Overview, Accounts, Transactions, Payments and Statements. It intentionally avoids forecasting, budgeting, OCR and bank import. Credit-card payments are presented as Bank-to-Card transfers, not expenses.
## Phase 15 planning views

Finance includes compact Cashflow, Budgets and Goals tabs. They dispatch focused
application commands and render application read models. Cashflow shows 7/14/30/90
day per-currency forecasts and underlying sources; budgets derive actuals from the
ledger; goals track manual or linked-reserve progress without creating transactions.
