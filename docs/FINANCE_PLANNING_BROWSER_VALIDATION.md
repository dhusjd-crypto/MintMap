# Finance Planning Browser Validation

Checkpoints: `c0a1e2f feat: add cashflow budgets and financial goals` and
`5d569ae fix: validate cashflow budgets and goals in browser`.

## Environment

- Runner: `npm run test:e2e:finance-planning`
- Browser: local Google Chrome through `playwright-core`
- Server: a fresh, runner-owned Vite process using the current source bundle
- URL: `http://127.0.0.1:5185/finance`
- Test data: isolated `phase15-browser-*` canonical records in a fresh Chromium
  profile. The runner terminates only its own Vite process.

## Strict Gate Completion

The canonical backup operation itself completed successfully through
`BACKUP_COMPLETE` and `VALIDATION_COMPLETE`. The earlier strict-gate failure
was E2E sequencing after a synthetic IndexedDB mutation, not backup creation.
The runner now confirms the mutation in canonical IndexedDB, reloads before
testing visibility, waits for the mounted Finance read model, then invokes the
real canonical restore and reloads again before restored UI assertions.

- Backup and checksum validation: PASS.
- Mutation persistence and visible UI state: PASS.
- Restore IDs, Money minor units, currency, book ownership, allocation relation,
  and goal configuration: PASS.
- Post-restore Cashflow: PASS; restored expected item participates in the
  forecast.
- FIN-T15: PASS. The 100,000 TRY liquid position and 150,000 TRY obligation
  create a 50,000 TRY shortfall; a canonical 60,000 TRY expected inflow clears
  the active shortfall signal and it remains cleared after refresh.
- FinanceBook isolation: PASS for Cashflow, Budgets, Goals, and FIN-T15.
- Currency isolation: PASS. TRY and USD are independently selectable; no FX or
  combined total is shown.
- Goal currency isolation: PASS. A TRY goal ignores a linked USD account.
- Budget double-count: PASS. An uncategorized 5,000 TRY card purchase remains
  5,000 TRY after the Bank -> Credit Card transfer and refresh.
- Console/network: PASS. No new errors and no remote AI, FX, or bank request
  is required.

## Observed Results

- Current bundle verification: PASS. Finance exposed Cashflow, Budgets and Goals.
- Cashflow: PASS. The view rendered expected inflow/outflow sources and accepted
  each 7/14/30/90-day selector value without a page error.
- Budget: PASS. The period and exact ledger-derived uncategorized spend rendered.
- Goal: PASS. A 250,000 / 1,000,000 TRY LAND fixture rendered as 25%.
- Persistence: PASS. v8 planning records remained readable after browser reload.
- Mobile width: PASS at 390x844.
- Network: PASS. Core planning flow made no remote AI, FX, bank, or market-data
  request.
- Console: PASS. No new page or console error was observed.

## Accounting fixtures

The fixture included a TRY BANK opening balance, two liquid BANK accounts, a
CREDIT_CARD, a LOAN, an unpaid obligation with a scheduled payment, a card
purchase, and an internal liquid transfer. It exercises the read-model paths
without writing into a user's FinanceBook.

## Limits

The runner uses a fresh Chromium profile, isolated `phase15-browser-*` records,
and its own Vite process on port 5185. It does not operate on user data. CAMT
remains a separately documented partial import format and does not affect this
planning validation.
