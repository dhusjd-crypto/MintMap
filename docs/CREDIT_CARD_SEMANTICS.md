# Credit Card Semantics

Credit cards are `LIABILITY` accounts. A purchase is represented by the card-account transaction and its expense/category information. A payment from a bank account is an explicit same-currency `FinancialTransfer` linking two transaction legs with one `transferId`.

The payment reduces the liability and leaves the asset account; it is not an additional expense. A statement creates a reviewed obligation for the statement balance. Minimum payment satisfaction is tracked separately from full payment, and only confirmed payments can mark the obligation paid.

FX transfers, interest/principal allocation, amortization, and portfolio reporting are outside Phase 4.
