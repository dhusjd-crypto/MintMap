# Canonical Identity Audit

## Current IDs

- Tasks are generated with `nanoid(6)` inside `mindmap.addTodo` and stored once in a node's `todos` array. The same task ID is used by task lists, Mind Map sheets, calendar/task adapters, reminders, exports, and sync tombstones.
- Mind Map nodes use `nanoid(8)` and are the current context/project-like identity. Node IDs are referenced by tasks, goals, Pulse, decisions, watchlist links, and relationships.
- Goals use `nanoid(8)` in `goal-store.ts`. Their `nodeIds` links are stable and progress is derived from linked node tasks.
- There is no first-class Project entity yet. Current project semantics are represented by node IDs; the compatibility ProjectRepository exposes nodes without generating new IDs.
- Workspace IDs use `nanoid(8)`. Google Calendar/Tasks IDs and Drive file/blob IDs are external identities and are stored as links, not replacements for canonical IDs.

## Findings and risks

There is no intentional task duplication across feature views, but the current nested `Workspace -> MindNode -> Todo[]` shape makes querying and future cross-store sync more difficult. IDs are not centrally typed and some imports/adapters can create records from external data. The compatibility layer must preserve all existing IDs and reject empty/unknown targets rather than regenerate them.

## Future rule

One real-world Task has one canonical Task ID. Views, notifications, calendar blocks, Windows, and Android reference it. A FinancialObligation remains a separate entity and may link to an execution task; it must not copy the amount into the task as authoritative data.

No IDs were changed in Phase 2.
