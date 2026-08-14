# Test Strategy

## Baseline coverage

The current unit suite has 12 files and 107 passing tests. Existing tests cover task utilities, store history, files/images, subtask migration, cloud sync, Google Tasks, Gemini, and NodeSheet behavior. CI runs TypeScript, unit tests, and production build.

## Required safety matrix

- App startup and unlock behavior.
- Task create, update, complete, reopen, delete, parent/child relationships, and sibling reorder.
- Mind Map node relationships and task projection.
- Current reminder/date behavior and recurring reminders.
- Import/export, missing optional fields, legacy `steps`, malformed snapshots, and repeated migrations.
- Tombstone propagation through local merge, cloud merge, Drive restore, and multi-device deletion.
- Keep cards and attachment retention/deletion.
- Calendar/Tasks/Drive adapters when configured and graceful behavior when unavailable.

## Test layers

- Pure unit tests for domain rules, parsers, scoring, migrations, and event contracts.
- Store/repository tests with old fixtures and property-style idempotency checks.
- Adapter contract tests with fake external services.
- Browser E2E for mobile navigation, task tree flow, capture, reminders, and critical save/error feedback.
- Build/typecheck in CI for every pull request.

Known gap: the Windows workspace currently cannot run `test:e2e` because the `python3` command is unavailable; CI remains the authoritative Linux E2E environment until a Windows launcher is added.
