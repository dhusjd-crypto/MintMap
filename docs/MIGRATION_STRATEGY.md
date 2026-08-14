# Migration and Recovery Strategy

## Rules

- Never replace a user snapshot with an empty default because parsing failed.
- Parse unknown/legacy data permissively, preserve unknown fields where possible, and write a new version only after a validated transformation.
- Every migration is idempotent and has a fixture containing before/after data.
- Export/backup is a precondition for risky changes. Recovery must be possible without the newest application bundle.
- Deletions use tombstones until all supported replicas have observed them; compaction is a separate, audited operation.

## Current migrations

- Storage key `mindgrove.v1` to `mindgrove.v2` is handled by the main store.
- Legacy `Todo.steps` is converted to child todos once and removed only after conversion; the migration preserves order, completion, and parent relationship.
- Cloud sync repairs preserve deletion tombstones for nodes, todos, Keep cards, and attachments.
- Cloudflare D1 migrations `0001_cloud_sync.sql` and `0002_sync_document_history.sql` create the sync document and recovery history tables.

## Proposed migration runner

Future schema changes should expose `CURRENT_SCHEMA_VERSION`, ordered migration functions, input/output validation, and a migration journal. Before commit: export JSON, test old fixtures, apply twice, simulate interrupted writes, and verify a recovery import.

## Local-first database evolution

SQLite is a future option for queryability and transactions, not a Foundation change. First introduce repository ports over current storage, then add a dual-read/dual-write shadow path, compare results, back up, and only then make SQLite authoritative. IndexedDB remains the browser blob store unless a platform-specific adapter replaces it.
