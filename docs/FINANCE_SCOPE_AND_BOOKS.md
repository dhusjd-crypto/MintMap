# Finance Scope and Books

Every financial record belongs to a `FinanceBook`:

- `PERSONAL`: household and personal money.
- `BUSINESS`: company or business money.
- `CUSTOM`: an explicitly named future book.

Accounts, transactions, obligations, payments, statements, categories, and payees are book-scoped. Phase 4 does not consolidate books. A future consolidated report must be explicitly requested and must not silently combine Personal and Business data. Cross-book transfers are not supported yet and are rejected by the domain.
