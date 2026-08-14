# Legacy Access Inventory

Status meanings: `MIGRATED` means the selected path uses the application boundary; `LEGACY` means intentionally unchanged and a future strangler target.

| Location | Direct dependency | Future owner | Risk | Status / phase |
|---|---|---|---|---|
| `TaskFormPanel.tsx` create handler | `mindmap.addTodo` | Execution CreateTask | task creation bypassed validation/events | MIGRATED Phase 2 |
| `TaskSheet.tsx` completion handler | `mindmap.toggleTodo` | Execution CompleteTask | completion semantics duplicated in UI | MIGRATED Phase 2 |
| `TaskSheet.tsx` edit/subtask/delete/attachments | `mindmap.updateTodo`, add/remove methods | Execution application commands | broad surface and undo semantics | LEGACY Phase 3 |
| `todos.tsx` list create/complete/bulk/delete | `mindmap` mutations | Execution commands | main task screen still bypasses boundary | LEGACY Phase 3 |
| `NodeSheet.tsx` task actions | `mindmap` mutations | Execution + Knowledge commands | node/task coupling | LEGACY Phase 3/17 |
| `AIChat.tsx`, `VoiceCapture.tsx`, `QuickCapture.tsx` | direct task creation/update | Capture proposal then Execution command | AI/voice can bypass confirmation | LEGACY Phase 11/24 |
| `calendar.tsx`, `board.tsx`, `DailyBrief.tsx` | direct reads/toggles | Application queries/commands | view-specific rules | LEGACY Phase 16 |
| `reminder-scheduler.ts` | `Date.now`, Notification, toast | Notification + Clock adapter | browser closed/delivery fatigue | LEGACY Phase 8 |
| `cloud-sync.ts` | local snapshot and D1 sync shape | Versioned SyncAdapter | separate stores/protocol | LEGACY Phase 20 |
| `keep-store.ts`, `goal-store.ts`, `pulse-store.ts`, `decision-store.ts`, `watchlist-store.ts` | localStorage | context repositories | independent sync/migration | LEGACY Phase 5/20 |
| `image-blobs.ts` and node/task file methods | IndexedDB | DocumentStorageAdapter | blob references/tombstones | LEGACY Phase 5 |
| `routes/todos.tsx`, calendar and components | `Date.now`, `new Date` in business filters | Clock/query layer | nondeterministic tests/timezones | LEGACY Phase 2/3 |
| `__root.tsx`, settings, theme and PWA | localStorage UI flags | UI state adapter | not domain data, low risk | LEGACY / UI maintenance |

No legacy access was removed. This inventory is the migration checklist.
