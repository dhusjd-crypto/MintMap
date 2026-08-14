# ADR-001: Canonical Entity Identity

Status: accepted

One real-world Task has one stable Task ID. Existing `Todo.id`, node IDs, workspace IDs, and goal IDs are preserved. Views and integrations store references, not authoritative copies. Current project semantics remain node IDs behind a compatibility adapter until a first-class Project entity is justified.
