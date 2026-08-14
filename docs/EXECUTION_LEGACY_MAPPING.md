# Execution Legacy Mapping

`legacyTaskToDomainTask` maps the existing `Todo` record into `ExecutionTask` with safe defaults:

- `text` → `title`, `note` → `description`.
- `done/status` → canonical state (`DONE`, `DOING`, otherwise `READY`).
- `dueAt` and `reminderAt` retain their distinct legacy meanings.
- `estimateMin`/`focusedMin` → estimated/actual minutes.
- `priority` 1–4 → CRITICAL/HIGH/NORMAL/LOW.
- `blockedBy` IDs become dependency references.
- missing timestamps use the best existing legacy timestamp or `0` for read-only mapping.

`domainTaskToLegacyPatch` is patch-based. It never replaces the complete persisted object, so unknown legacy fields remain untouched. IDs are copied exactly. Phase 5 adds an IndexedDB `execution_extensions` sidecar and a composed repository; no legacy task retirement or localStorage, D1, or Drive migration runs.
