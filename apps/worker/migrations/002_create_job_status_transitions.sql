-- Version-controlled job state graph. The trigger in migration 003 checks
-- every status change against this table; the negative transition matrix is
-- tested against this same artifact rather than implementation inference.
CREATE TABLE IF NOT EXISTS job_status_transitions (
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

-- Insert the allowed transition graph. Terminal states (completed, permanent,
-- timeout) have no outgoing edges.
INSERT INTO job_status_transitions (from_status, to_status) VALUES
  ('queued', 'running'),
  ('queued', 'failed'),
  ('running', 'completed'),
  ('running', 'failed'),
  ('running', 'permanent'),
  ('running', 'timeout'),
  ('failed', 'running'),
  ('failed', 'permanent'),
  ('failed', 'timeout')
ON CONFLICT (from_status, to_status) DO NOTHING;
