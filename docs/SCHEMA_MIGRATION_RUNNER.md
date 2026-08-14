# Schema Migration Runner Contract

Phase 5 connects canonical persistence to a durable journal and backup-aware runner. Legacy storage keys and persisted legacy schema remain unchanged.

`runMigrations(data, currentVersion, migrations, context)`:

- sorts and validates unique positive versions;
- skips versions at or below the stored version (run-once behavior);
- invokes an optional backup hook once before pending work;
- applies migrations in order in memory;
- returns applied versions and the new version only after all migrations succeed;
- throws `MigrationError` with the failed version and already-applied versions;
- never writes localStorage, IndexedDB, Drive, or D1 itself.

The canonical production runner adds the storage journal, backup/restore,
checksum validation, interruption/failure reporting, and unknown-field
preservation. Legacy storage still uses its own compatibility migrations and is
not silently converted by the canonical runner.
