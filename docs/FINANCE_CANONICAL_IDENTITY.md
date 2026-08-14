# Finance Canonical Identity

The stable identity of each Finance record is its explicit `id`:

`FinanceBook`, `FinancialInstitution`, `FinancialAccount`, `FinancialTransaction`, `FinancialTransfer`, `FinancialObligation`, `FinancialPayment`, `CreditCardStatement`, and `FinancialSchedule` each have their own identity.

Names, masked account identifiers, statement amounts, and statement dates are descriptive or duplicate-detection inputs only; none is a permanent identity. A transaction may reference a statement or source document, but it does not become that document.
