# Canonical Persistence Architecture

Phase 5 adds a local-first canonical namespace without replacing existing data.
The browser uses one versioned IndexedDB database, `mintmap-canonical`, for
canonical envelopes. Legacy Mind Map and Keep records remain in their existing
localStorage keys. Binary attachments continue to use `mintmap-blobs`.

The canonical database contains `meta`, `execution_extensions`, the Finance
stores, `migration_journal`, and `persistence_operations`. IndexedDB is an
adapter; domain rules and repository contracts do not depend on it.

Canonical persistence is initialized independently of legacy hydration. A
failure raises `mintmap:canonical-persistence-error`; it never creates an empty
replacement over existing data. New canonical records are local-only in this
phase and are not sent to D1 or Drive.

Each record stores `id`, `entityType`, `schemaVersion`, `revision`, timestamps,
and a typed `payload`. Payloads are data, not class instances, and unknown
metadata fields are retained.
