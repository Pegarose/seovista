-- Migration 016: Tracker alerts for Tier B B3.
-- Adds consent columns to tracker_sessions and creates the tracker_alerts
-- table. Alerts are written by the daily tracker_scan batch job whenever a
-- position transition crosses a fixed threshold; emailed_at gates the daily
-- digest and the UNIQUE(target_id, kind, observed_at) key makes re-runs
-- idempotent.

ALTER TABLE tracker_sessions
  ADD COLUMN alert_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN alert_consent_updated_at TIMESTAMPTZ;

CREATE TABLE tracker_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id     UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN
    ('dropped_out_of_top10','entered_top10','significant_drop','significant_rise')),
  from_position INTEGER NOT NULL,
  to_position   INTEGER NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at    TIMESTAMPTZ,
  UNIQUE(target_id, kind, observed_at)
);

CREATE INDEX idx_tracker_alerts_session ON tracker_alerts(session_id, created_at DESC);
CREATE INDEX idx_tracker_alerts_unsent  ON tracker_alerts(session_id) WHERE emailed_at IS NULL;
