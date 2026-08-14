# Backup and Restore

Local canonical backups are recovery artifacts, not cloud sync. The backup
store is separate from `mintmap-canonical`; Drive and D1 are not treated as the
only backup. Retention is configurable through `retainBackups`, which always
keeps at least one artifact.

Existing Drive backup/export paths remain unchanged. Canonical Finance and
Execution extension records are local-only until a later sync phase defines
conflict handling.
