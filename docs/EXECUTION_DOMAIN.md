# Execution Domain Core

Phase 3 introduces a platform-independent execution model. It is a domain model, not a replacement persisted schema.

## Canonical task

`ExecutionTask` owns task identity, lifecycle state, distinct planning dates, dependencies, waiting metadata, execution estimates, notification intent, source references, and timestamps. `projectId`, `goalId`, `sourceType`, and `sourceId` are references only; the referenced bounded context remains authoritative.

## Dates

- `startAt`: task should not normally become actionable before this instant.
- `doAt`: intended work time/date.
- `softEndAt`: desired internal completion target; missing it is not a hard failure.
- `dueAt`: real hard deadline.
- `remindAt`: explicit reminder independent from deadline.
- `followUpAt`: time to revisit a WAITING task. It creates follow-up eligibility, not automatic execution.

All domain time decisions use the injected `Clock`.

## Actionability

The domain only answers eligibility questions. It does not rank, score, schedule, notify, or select a NOW task. WAITING, BLOCKED, SOMEDAY, DONE, CANCELLED, future-start tasks, and tasks with incomplete dependencies are excluded from ready candidates.

## Ownership boundary

React, browser APIs, localStorage, IndexedDB, D1, Google, Drive, and AI remain outside this module. The legacy task repository maps the domain model to the existing `Todo` shape until a separately approved persistence migration.
