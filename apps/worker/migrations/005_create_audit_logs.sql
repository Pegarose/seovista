-- Append-only audit event log with bounded allowlisted metadata. Secrets,
-- tokens, HTML, email, connection strings, and stack traces must be rejected
-- by the application writer before insertion; the table stores only safe,
-- allowlisted metadata.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_identity TEXT NOT NULL CHECK (length(actor_identity) > 0),
  action TEXT NOT NULL CHECK (length(action) > 0),
  subject_identity TEXT NOT NULL CHECK (length(subject_identity) > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
  ON audit_logs (correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_recorded_at
  ON audit_logs (recorded_at);
