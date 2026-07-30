-- Restore retry and terminal transitions for jobs that first enter failed.
-- This is a compatibility migration because migration 002 may already be applied.
INSERT INTO job_status_transitions (from_status, to_status) VALUES
  ('failed', 'running'),
  ('failed', 'permanent'),
  ('failed', 'timeout')
ON CONFLICT (from_status, to_status) DO NOTHING;
