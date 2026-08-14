# Mind Map OS Roadmap

The order is deliberately incremental. A phase must leave the application usable and pass the safety matrix before the next phase starts.

0. Repository audit and baseline
1. Constitution, architecture docs, registry, regression fixtures **(this run)**
2. Shared foundations: canonical IDs, Clock, repository ports, commands/queries/events **(Phase 2 slice complete)**
3. Execution Domain Core
4. Finance Domain Core
5. Persistence and versioned migrations
6. Deterministic Trigger Engine
7. Planner and capacity
8. Notification Engine
9. Focus / NOW / execution modes
10. Reset and routines
11. Quick Capture
12. Finance ledger, obligations, statements
13. Finance triggers and payment workflow
14. Finance capture, import, reconciliation
15. Budgets and cashflow forecast
16. Smart Views and Command Center
17. Mind Map projection refactor
18. Windows/Tauri adapter
19. Android/Tauri adapter
20. Local-first multi-device sync hardening
21. Calendar, Gmail, ActivityWatch adapters
22. Learning and analytics
23. Investments and wealth
24. Optional AI assistant proposals
25. Hardening, backup, recovery, performance
26. Final architecture audit

Foundation stops after Phase 1. The exact next engineering phase is Phase 2: introduce ports, a deterministic Clock, typed commands/queries/events, and repository contract tests around the existing stores without changing the persisted schema.
