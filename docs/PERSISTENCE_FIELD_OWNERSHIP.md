# Persistence Field Ownership

| Field | Legacy source | Canonical extension | Authority | Read precedence | Migration status |
| --- | --- | --- | --- | --- | --- |
| Task ID | `Todo.id` | `taskId` key only | Legacy identity | Legacy | Preserved |
| Title | `Todo.text` | None | Legacy | Legacy | Preserved |
| Description | `Todo.note` | None | Legacy | Legacy | Preserved |
| Completion/state | `done`, `status` | `state` for richer states | Legacy for current UI; extension for canonical state | Extension when present | Sidecar |
| Due/reminder | `dueAt`, `reminderAt` | Canonical copy for future precision | Legacy until command integration | Extension when present | Sidecar-ready |
| Start/do/soft end/follow-up | None | Extension | Extension | Extension | Implemented |
| Duration/chunk/splittable | `estimateMin`, `focusedMin` | Extension for new fields | Legacy for legacy fields | Extension when present | Implemented |
| Dependencies | `blockedBy` | `blockedBy`, `blocks` | Extension for canonical graph | Extension when present | Sidecar |
| Priority | `priority` | `manualPriority` | Extension for canonical scale | Extension when present | Sidecar |
| Waiting/context/energy/impact | None or incomplete | Extension | Extension | Extension | Implemented |
| Source reference | Existing Google IDs/metadata | `sourceType`, `sourceId` | Extension | Extension | Implemented |
| Unknown legacy fields | Persisted `Todo` object | Never copied blindly | Legacy | Legacy | Preserved |

The composed repository writes the extension first and then applies a narrow
legacy patch. A failed second write is reported as a retryable partial write;
it never emits a success event or deletes the legacy record.
