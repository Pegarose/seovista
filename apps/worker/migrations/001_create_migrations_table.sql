-- Migration tracking table. Each migration runs inside a single transaction;
-- failures roll back schema changes and leave this table untouched for that
-- migration.
CREATE TABLE IF NOT EXISTS seovista_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
