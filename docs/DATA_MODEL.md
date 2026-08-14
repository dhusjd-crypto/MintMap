# Data Model and Persistence

## Current canonical records

- `Workspace`: workspace identity, nodes, and deletion tombstones.
- `MindNode`: context/project/topic node, relationships, notes, media, files, and embedded todos.
- `Todo`: canonical action identity, state, parentId tree, dates, reminders, priority, tags, dependencies, calendar/task links, notes, attachments, and activity.
- `KeepCard`: raw capture with text/link/media/file and categorisation metadata.
- `Goal`, `PulseItem`, `Decision`, and Borsa watch records: separate feature stores with explicit links back to node IDs where applicable.

Phase 3 adds an in-memory `ExecutionTask`, `ExecutionProject`, and `ExecutionGoal` domain model. These are canonical business contracts for execution behavior, while legacy `Todo`, `MindNode`, and `Goal` shapes remain the current persisted compatibility representations.

The task tree is now the one hierarchy: legacy `steps` are converted once into todos with `parentId`; no new code should add a second step model.

## Storage layers

1. localStorage JSON snapshots for small structured records and tombstones.
2. IndexedDB blob storage for images and files.
3. Cloudflare D1 sync document and recoverable history for cloud snapshots.
4. Google Drive as an external backup/synchronization adapter, never the sole authority.

## Target identity rules

IDs are stable and survive view changes, sync, export/import, and platform changes. A view may index a record but must not clone it. A financial obligation and a related execution task are separate records linked by `sourceType`/`sourceId` or an explicit relationship.

## Future version concepts

- Application version: shipped code.
- Schema version: local/domain shape.
- Sync protocol version: merge and tombstone contract.
- Feature registry version: accepted scope and rollout state.

They must be tracked independently. See `docs/MIGRATION_STRATEGY.md` before adding fields or changing persistence.
