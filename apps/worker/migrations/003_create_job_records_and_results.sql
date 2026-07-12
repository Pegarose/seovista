-- Immutable job result payloads referenced by the job lifecycle table.
CREATE TABLE IF NOT EXISTS job_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT NOT NULL,
  job_identity TEXT NOT NULL,
  result_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_results_correlation
  ON job_results (correlation_id);
CREATE INDEX IF NOT EXISTS idx_job_results_job_identity
  ON job_results (job_identity);

-- Authoritative job lifecycle table. BullMQ state is transport evidence and must
-- reconcile to this history, never replace it.
CREATE TABLE IF NOT EXISTS job_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_identity TEXT NOT NULL UNIQUE,
  target TEXT CHECK (target IS NULL OR length(target) > 0),
  queue_name TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'permanent', 'timeout')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  terminal_class TEXT CHECK (terminal_class IN ('retryable', 'permanent', 'timeout', 'success')),
  result_id UUID REFERENCES job_results(id) ON DELETE SET NULL,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_records_correlation
  ON job_records (correlation_id);
CREATE INDEX IF NOT EXISTS idx_job_records_status
  ON job_records (status);
CREATE INDEX IF NOT EXISTS idx_job_records_identity
  ON job_records (job_identity);

-- Transition validation trigger.
CREATE OR REPLACE FUNCTION validate_job_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM job_status_transitions
    WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Invalid job status transition from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.attempt_count < OLD.attempt_count THEN
    RAISE EXCEPTION 'attempt_count cannot decrease from % to %', OLD.attempt_count, NEW.attempt_count;
  END IF;

  IF NEW.result_id IS NOT NULL AND NEW.status != 'completed' THEN
    RAISE EXCEPTION 'result_id can only be set for completed status';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'completed status requires completed_at';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_transition_trigger ON job_records;
CREATE TRIGGER job_transition_trigger
BEFORE UPDATE ON job_records
FOR EACH ROW EXECUTE FUNCTION validate_job_transition();
