-- Phase A single-flight request dedupe (VAL-A-MIT-001 / VAL-A-MIT-002).
--
-- Concurrent form submissions of the same canonical URL must produce exactly
-- one job_records row. The worker guards the enqueue path with a Redis
-- single-flight lock (`geo:lock:{sha256(canonicalUrl)}`) in DB 1, but it also
-- needs a durable Postgres-side handle so a deduped request can locate the
-- in-flight job_records row and poll its `status` instead of enqueuing a
-- duplicate. `cache_key` stores the bare sha256(canonicalUrl) so the lookup
-- survives a Redis lock value race (lock acquired but the owner has not
-- inserted its job_records row yet) and so validators can assert
-- `SELECT COUNT(*) FROM job_records WHERE cache_key = '...' = 1`.

ALTER TABLE job_records ADD COLUMN IF NOT EXISTS cache_key TEXT;

-- Partial index over non-terminal rows so the in-flight lookup stays cheap
-- even once the table accumulates completed history. A deduped request only
-- ever cares about queued/running jobs; terminal rows are intentionally
-- excluded so a re-audit after completion is not mistaken for an in-flight
-- duplicate.
CREATE INDEX IF NOT EXISTS idx_job_records_cache_key_inflight
  ON job_records (cache_key)
  WHERE status IN ('queued', 'running');
