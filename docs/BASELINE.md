# Foundation Baseline — 2026-08-14

## Passed

- `npm.cmd install --ignore-scripts` — completed; package audit reports 6 high severity advisories for existing dependency graph. No lockfile diff was produced.
- `npx.cmd tsc --noEmit` — passed.
- `npm.cmd run test:unit` — passed: 12 files, 107 tests.
- `npm.cmd run build` — passed. Vite emitted non-fatal third-party `use client` bundle warnings.

## Known failures or gaps

- `npm.cmd run lint` — fails on a pre-existing large Prettier backlog, including `public/sw.js`, AI components, and Mind Map components. Foundation did not reformat unrelated production files.
- `npm.cmd run test:e2e` — unavailable on this Windows machine because the repository script invokes `python3`, which is not installed/registered. CI runs the same E2E suite on Ubuntu with Python and Playwright.
- No native Windows/Android runtime exists in this repository yet.
- Browser reminder delivery is best effort when the browser is closed.
- Goals, Pulse, decisions, watchlist, and Keep have separate local stores; a unified sync contract is future work.

This file records the baseline honestly; no check is marked green when it could not run.
