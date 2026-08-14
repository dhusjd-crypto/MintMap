# Migration Recovery

Before a risky canonical migration, `createBackup` stores a versioned bundle
in the separate `mintmap-backups` IndexedDB database. The bundle contains
relevant legacy localStorage keys, canonical envelopes, and available MintMap
blob data. It has a manifest, record counts, and a SHA-256 checksum when Web
Crypto is available.

`validateBackup` verifies the manifest and checksum before restore.
`restoreBackup` is programmatic and deliberately not a broad UI action yet.
Failed migrations remain journaled and block automatic retry until recovery.
