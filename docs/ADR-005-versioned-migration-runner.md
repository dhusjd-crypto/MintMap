# ADR-005: Versioned Migration Runner Strategy

Status: accepted

The migration runner is pure and synthetic in Phase 2. Production storage is unchanged until backup, journal, recovery, interruption tests, and unknown-field preservation are implemented. A schema version is not incremented by adding the runner contract.
