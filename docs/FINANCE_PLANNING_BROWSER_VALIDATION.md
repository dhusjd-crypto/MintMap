# Finance Planning Browser Validation

Checkpoint: `c0a1e2f feat: add cashflow budgets and financial goals`.

## Environment

- Runner: `npm run test:e2e:finance-planning`
- Browser: local Google Chrome through `playwright-core`
- Server: a fresh, runner-owned Vite process using the current source bundle
- URL: `http://127.0.0.1:5185/finance`
- Test data: isolated `phase15-browser-*` canonical records in a fresh Chromium
  profile. The runner terminates only its own Vite process.

## Observed results

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

The runner verifies browser read/render/persistence behavior. Full backup/restore
round-trip remains covered by the canonical persistence test suite; it is not run
against browser fixtures to avoid any risk to user backup namespaces.
