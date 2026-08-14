# ADR-002: Application Command Boundary

Status: accepted

New or migrated UI flows call typed application commands. Commands validate input, call compatibility repositories, and emit minimal events. Existing direct store APIs remain temporarily available and are tracked in `docs/LEGACY_ACCESS_INVENTORY.md`.
