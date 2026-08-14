# ADR-003: Legacy Repository Compatibility

Status: accepted

`LegacyTaskRepository`, `LegacyProjectRepository`, and `LegacyGoalRepository` wrap current stores without changing persisted data. This is the strangler seam for future domain repositories; it is intentionally not a new database or a store rewrite.
