-- Migration tracking table with checksum support.
-- Each migration runs inside a single transaction; failures roll back
-- both schema changes and the ledger entry for that migration.
CREATE TABLE IF NOT EXISTS seovista_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL DEFAULT 'legacy',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
