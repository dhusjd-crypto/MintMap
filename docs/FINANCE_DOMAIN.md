# Finance Domain Core

Finance is the bounded context that owns money truth. It is independent from React, browser APIs, persistence, integrations, AI, and Execution.

## Money

Authoritative amounts use integer minor units plus an explicit `CurrencyCode` (`TRY`, `USD`, `EUR`). Arithmetic rejects currency mismatch and unsafe integers. No floating point amount is authoritative and no FX conversion exists in Phase 4.

## Transaction convention

Amounts are account-relative: positive enters an account, negative leaves it. A credit-card purchase is a liability-account activity and a card payment is an explicit transfer leg, not a second expense.

## Lifecycle ownership

Finance owns accounts, transactions, transfers, obligations, payments, statements, categories, payees, and recurrence primitives. Execution may later reference these records through `sourceType`/`sourceId`; Finance never creates tasks directly.

Persistence ports and in-memory test repositories exist, but no production schema or store has been changed.
