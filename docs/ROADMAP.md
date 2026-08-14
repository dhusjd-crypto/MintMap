# Mind Map OS Roadmap

The order is deliberately incremental. A phase must leave the application usable and pass the safety matrix before the next phase starts.

0. Repository audit and baseline
1. Constitution, architecture docs, registry, regression fixtures **(this run)**
2. Shared foundations: canonical IDs, Clock, repository ports, commands/queries/events **(Phase 2 slice complete)**
3. Execution Domain Core **(Phase 3 complete)**
4. Finance Domain Core **(Phase 4 complete)**
5. Persistence and versioned migrations
6. Deterministic Trigger Engine **(Phase 6 complete; Planner/Calendar signals remain partial)**
7. Planner and capacity **(Phase 7 complete; Calendar adapter remains partial)**
8. Notification Engine **(Phase 8 complete; native delivery and full trigger orchestration remain partial)**
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

Phase 3 establishes the pure Execution Domain. Phase 4 establishes the Finance Domain Core. Phase 5 adds local canonical IndexedDB persistence, Execution sidecars, migration journal, and local backup/restore without changing D1/Drive sync. The next accepted phase is the deterministic Trigger Engine, after any remaining persistence integrity issues are closed.
