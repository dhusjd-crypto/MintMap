# Existing Finance-Like Data Audit

## Borsa

`src/lib/watchlist-store.ts` owns a watchlist of symbols, names, investment theses, risks, catalysts, earnings dates, notes, and watch status. It does not own accounts, holdings, transactions, balances, transfers, or broker credentials. It remains untouched in Phase 4.

Future investment entities must be introduced through an explicit adapter. Watch items must not become financial ledger truth.

## Other stores

- Mind Map todos and nodes contain task, note, date, and relationship data; they are not money records.
- Kutu cards may contain captured financial text, links, images, or PDFs; Capture/Knowledge remains authoritative until a reviewed Finance proposal exists.
- Pulse and Decision records may mention finance in prose or source labels, but do not contain canonical amounts or accounts.
- Goals and reminders are execution/planning records, not obligations or payments.

No existing finance-like store was migrated or merged.
