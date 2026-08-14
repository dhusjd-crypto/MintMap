# Current D1 Sync

The existing Cloudflare D1 adapter continues to synchronize its version-1
snapshot containing the legacy Mind Map and Keep projections. Phase 5 does not
change its payload, schema, revision handling, or merge logic.

Canonical Finance records and Execution extension envelopes are intentionally
not sent to D1 yet. They are local-only and must not be presented as
multi-device synchronized data.
