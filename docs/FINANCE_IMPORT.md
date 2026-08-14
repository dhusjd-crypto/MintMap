# Finance Import

Phase 14 implements configurable CSV import. Every batch targets one FinanceBook and account. Rows are proposals until confirmation; bank-file rows become `CLEARED`, never `RECONCILED` automatically. OFX/QFX/QIF/CAMT remain planned contracts.
