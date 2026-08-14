# Finance Import

Phase 14B adds normalized file adapters for CSV, OFX, QFX, QIF and a bounded CAMT subset. All produce `ImportRowProposal` records and require preview/review before canonical transactions are written. CSV remains user-mapped; structured adapters preserve external IDs/reference metadata for explainable matching.

Phase 14 implements configurable CSV import. Every batch targets one FinanceBook and account. Rows are proposals until confirmation; bank-file rows become `CLEARED`, never `RECONCILED` automatically. OFX/QFX/QIF/CAMT remain planned contracts.
