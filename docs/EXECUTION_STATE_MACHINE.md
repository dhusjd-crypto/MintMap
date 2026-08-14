# Execution State Machine

## States

| State       | Meaning                                              |
| ----------- | ---------------------------------------------------- |
| `INBOX`     | Captured, not organized.                             |
| `READY`     | Actionable and eligible for future selection.        |
| `PLANNED`   | Assigned to a future work period.                    |
| `NOW`       | Current execution candidate.                         |
| `DOING`     | Explicitly started.                                  |
| `WAITING`   | Waiting for an external person, event, or condition. |
| `BLOCKED`   | A prerequisite is incomplete.                        |
| `SOMEDAY`   | Intentionally inactive/backburner.                   |
| `DONE`      | Successfully completed.                              |
| `CANCELLED` | Intentionally abandoned; not unfinished work.        |

Transitions are explicit. DONE and CANCELLED require an explicit reopen/reactivation operation. WAITING never becomes NOW merely because `followUpAt` is reached. BLOCKED cannot become READY/NOW/DOING while required dependencies are incomplete. Completing a task sets `completedAt`; reopening clears it and returns the task to READY. `lastTouchedAt` changes on semantic edits and state changes, never on reads/renders.
