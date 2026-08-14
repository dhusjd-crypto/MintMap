# Schema Migration Runner Contract

Phase 2 defines but does not connect this runner to production storage. The current storage keys and persisted schema remain unchanged.

`runMigrations(data, currentVersion, migrations, context)`:

- sorts and validates unique positive versions;
- skips versions at or below the stored version (run-once behavior);
- invokes an optional backup hook once before pending work;
- applies migrations in order in memory;
- returns applied versions and the new version only after all migrations succeed;
- throws `MigrationError` with the failed version and already-applied versions;
- never writes localStorage, IndexedDB, Drive, or D1 itself.

Before production adoption, add a storage journal, export/recovery implementation, interruption tests, unknown-field preservation, and an explicit rollback policy. Do not increment the real schema version merely because this contract exists.
