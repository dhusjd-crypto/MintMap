# Phase 5.5 Browser Persistence Validation

Date: 2026-08-14

## Scope

Phase 5.5 validated the Phase 5 persistence layer in a real Chromium-based Codex
in-app browser session. No Trigger Engine, D1/Drive migration, SQLite, UI,
finance product screen, or user-data migration was introduced.

The validation page was temporary, served only by the local Vite development
server, used `phase55-test-*` identifiers, and was removed after the run. All
fixture records and temporary backups were deleted after validation.

## Browser/runtime

- Browser: Codex In-app Browser, Chromium runtime
- Startup path: `npm.cmd run dev -- --host 127.0.0.1`
- Ports `8080` and `8081` were occupied, so Vite selected `http://127.0.0.1:8082/`.
- Local unlock used the documented development password. The application then
  loaded the existing legacy Mind Map projection without a reset prompt.

## Results

### A. Startup and legacy survival

- Application startup: PASS
- Existing legacy Mind Map/task projection visible: PASS
- Canonical initialization did not overwrite legacy storage: PASS
- Canonical schema metadata was readable at version 1: PASS
- No new browser console warnings or errors were observed: PASS

### B. Execution persistence

- Real IndexedDB `execution_extensions` round-trip through a page reload: PASS
- Canonical task identity remained stable: PASS
- Extension fields covered state, start/do/due/follow-up timestamps, estimate,
  waiting-for, manual priority, energy requirement, and source identity: PASS
- Legacy compatibility behavior remained unchanged: PASS
- Partial-write behavior remains covered by the existing unit test with an
  isolated failing legacy adapter. A destructive failure injection was not run
  against the live browser task store.

### C. Finance persistence

Using isolated fixture records only:

- Personal and Business FinanceBook records: PASS
- Personal bank and credit-card accounts plus a Business account: PASS
- Transaction, transfer, obligation, partial payment, statement, and schedule: PASS
- Reload/reopen survival: PASS
- Canonical IDs and relationships: PASS
- Personal/Business isolation: PASS

### D. Money and dates

- `87,450.37 TRY` was physically persisted as `{ minorUnits: 8745037, currency: "TRY" }`: PASS
- No floating-point money representation was written: PASS
- Statement, obligation, scheduled payment, and execution timestamps survived
  reload without a day shift: PASS
- Stored representation is numeric epoch milliseconds; timezone conversion is
  left to the presentation boundary.

### E. Backup and restore

- Backup namespace `mintmap-backups`: PASS
- Manifest/schema/checksum validation: PASS
- Canonical database and blob source sections were included: PASS
- Isolated delete/modify/restore round-trip: PASS
- IDs, relationships, exact Money, and dates returned: PASS
- Retention kept the newest valid backups and did not prefer a corrupted backup: PASS
- Temporary backup IDs were intentionally not retained; all Phase 5.5 backups
  were removed during cleanup.

### F. Migration and corruption

- Migration metadata and journal store readable: PASS
- Completed startup did not rerun or duplicate migrations: PASS
- One malformed Finance envelope did not block valid records: PASS
- Malformed record was quarantined in `persistence_operations`: PASS
- Database was not wiped: PASS

### G. Multi-tab behavior

Two local application tabs were opened successfully and both hydrated without
new console errors. Full cross-tab update propagation was not claimed: the
current canonical layer has no `storage` listener or `BroadcastChannel` path,
and Phase 5.5 explicitly does not require real-time synchronization.

Risk: a stale tab can overwrite a newer canonical extension if both tabs write
the same entity based on an old revision. Revision metadata exists, but an
optimistic concurrency check is future work before multi-tab canonical writes
become a primary workflow.

### H. Storage inspection

Observed databases:

- `mintmap-canonical`, version 1
- `mintmap-backups`, version 1
- existing `mintmap-blobs`

Observed canonical stores:

`meta`, `execution_extensions`, all Finance entity stores,
`migration_journal`, and `persistence_operations`. The backup database exposed
the `backups` object store. No user record contents are included here.

### I. D1 / Drive regression

No D1 or Drive protocol code was changed or invoked with canonical Finance data.
Their existing behavior remains intentionally separate:

- legacy synced data: unchanged
- canonical Execution extensions: local-only
- canonical Finance: local-only

### J. Performance and console

Startup, canonical initialization, indexed queries, fixture persistence, backup,
restore, and reload completed without an obvious pathological delay. No new
UnhandledPromiseRejection, IndexedDB transaction, DataCloneError, schema,
serialization, migration, or backup validation error was observed.

## Automated verification

- TypeScript: PASS
- Unit tests: PASS, 153/153
- Production build: PASS
- Targeted lint: PASS
- `git diff --check`: PASS
- Existing Python E2E launcher: NOT RUN; `python3` is unavailable in the environment
- Full lint: known pre-existing legacy backlog remains; unrelated files were not changed

## Change made during validation

`retainBackups` now validates backups before retention ordering. Valid backups
are always preferred over checksum-invalid backups, while the minimum retention
floor is preserved. A unit regression test covers the case.

## Risks

- CRITICAL: none observed
- HIGH: none observed in the validated single-tab persistence path
- MEDIUM: canonical multi-tab optimistic concurrency protection is not yet enforced
- LOW: Python-based E2E launcher remains unavailable; browser validation used the
  real app and temporary local harness instead

## Phase 6 readiness

**READY FOR DETERMINISTIC TRIGGER ENGINE: YES**, with the medium multi-tab
optimistic-concurrency limitation recorded above. Trigger Engine work must not
silently expand canonical persistence scope; revision conflict handling should
be addressed before multi-tab canonical writes become user-facing.
