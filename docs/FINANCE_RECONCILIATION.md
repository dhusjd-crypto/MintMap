# Finance Reconciliation

Reconciliation uses exact minor units: opening balance plus selected canonical transactions must equal the entered closing balance. A non-zero difference blocks completion. Completion moves included transactions to `RECONCILED`, where existing domain protection prevents casual edits.
