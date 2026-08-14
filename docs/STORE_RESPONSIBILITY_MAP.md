# Store Responsibility Map

| Store | Owns today | Business/UI/persistence coupling | Future owner |
|---|---|---|---|
| `mindmap-store.ts` | Workspaces, nodes, todos, task tree, history, files/images, tombstones, local JSON and IndexedDB coordination | High: aggregate, commands, migration, persistence, blob recovery, and sync-facing shape are together | Execution, Knowledge, Infrastructure, UI State split incrementally |
| `keep-store.ts` | Kutu cards, categories, card tombstones, blobs, local JSON | Medium/high: capture data and persistence in one module | Capture + Knowledge + Infrastructure |
| `goal-store.ts` | Goals and node links, local JSON | Medium: CRUD and persistence together; progress is derived externally | Goal/Planning + Infrastructure |
| `pulse-store.ts` | Pulse items, read/dismiss/link state, demo seed, local JSON | Medium: demo source and feature state together | Analytics/Knowledge + Integration |
| `decision-store.ts` | Decisions and node/watch links, local JSON | Medium: CRUD/persistence together | Knowledge/Analytics + Infrastructure |
| `watchlist-store.ts` | Borsa watch records | Medium: feature data and local persistence | Finance/Analytics + Infrastructure |
| `cloud-sync.ts` | Snapshot merge, polling, debounce, D1 push/pull and status | High: sync protocol coupled to current snapshots | Sync Infrastructure behind VersionedSyncAdapter |
| `reminder-scheduler.ts` | Browser timers, fired state, Notification/toast delivery | High: scheduling and delivery together | Notification + Clock + Platform adapter |
| `google-tasks-sync.ts` / `calendar-sync.ts` | External reconciliation and auto-sync policy | High: adapter and local policy together | Integration adapters + application use-cases |
| `drive-backup.ts` / `drive-auto.ts` | Drive backup/restore and interval policy | Medium/high: backup and policy together | Sync/Backup Infrastructure |
| `focus-engine.ts` | Current deterministic focus scoring | Medium: pure logic is relatively extractable | Trigger/Focus domain |
| `goal`, `pulse`, `decision`, and watch UI components | Selection/modal/form state | UI state mixed with calls to stores | UI State + application commands |

Phase 2 adds adapters around the most important task/project/goal paths without moving these stores.
