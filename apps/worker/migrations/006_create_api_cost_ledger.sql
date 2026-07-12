-- Immutable API cost ledger. Exact non-negative decimal amounts, duplicate
-- request identity rejection, and no mutation after insert.
CREATE TABLE IF NOT EXISTS api_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (length(provider) > 0),
  operation TEXT NOT NULL CHECK (length(operation) > 0),
  request_identity TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) > 0),
  amount NUMERIC(18, 6) NOT NULL CHECK (amount >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cost_ledger_correlation
  ON api_cost_ledger (correlation_id);
CREATE INDEX IF NOT EXISTS idx_api_cost_ledger_recorded_day
  ON api_cost_ledger (provider, operation, DATE(recorded_at AT TIME ZONE 'UTC'));
