# Bounded Contexts

| Context | Owns | Must not own |
|---|---|---|
| Execution | Tasks, states, subtasks, dependencies, execution metadata, action identity | Money truth, calendar availability, UI layout |
| Finance | Accounts, ledger, obligations, statements, budgets, cashflow, wealth | Task state or notification delivery |
| Knowledge / Mind Map | Nodes, relationships, notes, visual projection and context | A second copy of tasks |
| Planning | Plans, blocks, capacity, chunking, locks, re-planning | Task completion authority |
| Trigger Engine | Deterministic priority signals and reasons | AI authority or notification delivery |
| Notification | Policies, nudges, escalation, quiet hours, delivery attempts | Task truth or score calculation |
| Capture | Text, clipboard, voice, image, PDF, email and file ingestion proposals | Silent authoritative mutation |
| Analytics / Learning | Derived metrics, confidence, sample size, trends | Operational state |
| Integration Layer | Google, Drive, Gmail, ActivityWatch, sync and future connectors | Canonical business rules |
| AI | Optional proposals, summaries and classifications | Any authoritative state |

The first implementation step is not moving every file. It is adding contracts at new seams and migrating one use-case at a time.

## Ownership examples

- Finance creates `FinancialObligationDueSoon`; Trigger/Notification decides whether and how to nudge; Execution may own a resulting payment task.
- Calendar reports availability; Planning allocates canonical task IDs into blocks.
- Capture proposes a task or financial record; the user/application validates it before persistence.
- Mind Map renders task IDs and relationships; it does not create a second task copy.
