-- Allow terminal failure transitions directly from queued. The worker
-- catch-path UPDATE (schema-worker.ts, ai-crawler-worker.ts, geo-worker.ts)
-- maps processor errors to 'permanent' or 'timeout' before rethrowing; when
-- the row is still 'queued' at that point, the transition trigger from
-- migration 003 rejected the UPDATE with 'Invalid job status transition from
-- queued to ...', masking the real failure and leaving the row stuck.
-- Compatibility migration in the style of 013: migration 002 already defines
-- ('queued', 'failed'), so all three edges are inserted idempotently.
INSERT INTO job_status_transitions (from_status, to_status) VALUES
  ('queued', 'failed'),
  ('queued', 'permanent'),
  ('queued', 'timeout')
ON CONFLICT (from_status, to_status) DO NOTHING;
