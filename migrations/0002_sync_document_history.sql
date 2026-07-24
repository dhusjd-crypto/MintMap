-- Preserves a recoverable copy before targeted cloud-sync repairs.
CREATE TABLE IF NOT EXISTS sync_document_history (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  archived_at INTEGER NOT NULL
);
