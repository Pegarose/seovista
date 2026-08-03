# Task 4 Report — Tracker Scan Queue + Worker + Scheduler

## What was implemented

Three new/modified files completing the BullMQ repeatable batch job wiring for the Tier B B1 recurring keyword rank tracker:

1. **`apps/worker/src/queue/tracker-scan-submission.ts`** (new) — BullMQ queue name constants (`TRACKER_SCAN_QUEUE_NAME`, `TRACKER_SCAN_JOB_NAME`, `TRACKER_SCAN_JOB_RECORD_QUEUE_NAME`), a singleton Queue producer with `__resetTrackerScanSubmissionQueueForTests` reset helper, `closeTrackerScanSubmissionQueue()`, and `registerTrackerScanRepeatable(redisUrl)` which adds a repeatable job with cron pattern `0 3 * * *` (overridable via `TRACKER_SCAN_CRON` env). Mirrors the `keyword-rank-submission.ts` singleton pattern.

2. **`apps/worker/src/queue/tracker-scan-worker.ts`** (new) — `startTrackerScanWorker(options?)` that starts a BullMQ Worker (concurrency 1, autorun). On each fire it creates a `job_records` row (`queue_name = 'tracker_scan'`, `target = 'batch'`, `status = 'running'`), calls `processTrackerScanBatch({ db, provider, delayMs })`, stores the batch summary in `job_results` (`result_type = 'tracker-scan:result'`), and updates the record to `completed`/`failed`. The DB client is closed on worker `closed`. Provider is injectable for tests. Mirrors `crew-report-worker.ts` structure.

3. **`apps/worker/src/worker.ts`** (modified) — added imports for `startTrackerScanWorker` and `{ registerTrackerScanRepeatable, closeTrackerScanSubmissionQueue }`; added `trackerScanWorker: Worker` to the `RunningWorker` interface; starts the worker after `crewReportWorker` and registers the daily repeatable; added `trackerScanWorker.close(false)` + `closeTrackerScanSubmissionQueue()` to the shutdown sequence (between crew report and keyword rank worker close).

4. **`apps/worker/src/__tests__/tracker-scan-submission.test.ts`** (new) — the brief's test, mocking BullMQ's `Queue`/`Worker` and asserting the repeatable registration uses the correct cron pattern and honors `TRACKER_SCAN_CRON`.

## TDD evidence

### RED (before implementation)
```
Error: Cannot find module '../queue/tracker-scan-submission.js' imported from
  'C:/bc-proje/Seovista/apps/worker/src/__tests__/tracker-scan-submission.test.ts'
Test Files  1 failed (1)
     Tests  no tests
```

### GREEN (after implementation)
```
 ✓ src/__tests__/tracker-scan-submission.test.ts (2 tests) 3ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Both tests pass: (1) `registerTrackerScanRepeatable adds a repeatable job with the cron pattern` and (2) `uses the TRACKER_SCAN_CRON env when set`.

## Files changed
- `apps/worker/src/queue/tracker-scan-submission.ts` (created)
- `apps/worker/src/queue/tracker-scan-worker.ts` (created)
- `apps/worker/src/__tests__/tracker-scan-submission.test.ts` (created)
- `apps/worker/src/worker.ts` (modified — import + interface + start + register + shutdown)

## Full worker test suite results

`pnpm --filter @seovista/worker exec vitest run` (with `SEOVISTA_LIFECYCLE_CONTEXT_PATH` set):
- 291 passed / 4 failed (42 files: 39 passed, 3 failed)
- `pnpm --filter @seovista/worker exec tsc --noEmit` — clean (exit 0)

### Failures — all pre-existing or environmental, NOT caused by Task 4

1. **`infrastructure.test.ts > applies all migrations to an empty database`** — expects `appliedIds` to equal `[1..14]` but the DB now has 15 migrations. Migration 015 was added by Task 1 (commit `ffedb92`). The test's hardcoded expectation was not updated in Task 1. Task 4 does not touch migrations. **Pre-existing Task 1 debt.**

2. **`geo-worker.test.ts > handles 429 rate limit correctly`** — explicitly called out in the brief as a known acceptable environmental failure.

3. **`geo-worker.test.ts > notifies Crew Agency when CREW_AGENCY_API_KEY is configured and score is low`** — environmental/downstream of the same 429 condition; flaky across runs (appeared in one run, not another).

4. **`migration-invariants.test.ts > advisory lock serializes concurrent access`** — flaky parallel-test timing (advisory lock release race); appeared in one run, not the other. Unrelated to Task 4 (no migration changes in this task).

### Verification that failures are pre-existing
- The infrastructure test hardcodes `[1..14]`; migration 015 has been committed since `ffedb92` (Task 1). Task 4 adds no migrations and does not import `worker.ts` into the infrastructure test.
- The geo-worker and migration-invariants failures vary between runs (flaky/environmental) and are in modules Task 4 never touches.

## Self-review findings

- Followed the existing `keyword-rank-submission.ts` singleton Queue pattern (`__resetForTests`, URL-keyed cache, `closeXxxSubmissionQueue`) and `crew-report-worker.ts` Worker pattern (`parseRedisUrl`, `createDbClient({ max: 2 })`, `worker.on("closed", () => db.close())`, options for queueName/concurrency/provider injection).
- Two unused-import TS6133 errors from the brief's verbatim code were corrected: removed `TRACKER_SCAN_QUEUE_NAME` from the test import (only `TRACKER_SCAN_JOB_NAME` is asserted) and removed `TRACKER_SCAN_JOB_NAME` from the worker import (the worker uses `TRACKER_SCAN_QUEUE_NAME` and `TRACKER_SCAN_JOB_RECORD_QUEUE_NAME` only). `tsc --noEmit` is now clean.
- The repeatable registration is idempotent per BullMQ's repeat-key dedupe (job name + pattern), so re-registering on every startup is safe — documented in the code comment.
- The shutdown ordering places `trackerScanWorker.close(false)` + `closeTrackerScanSubmissionQueue()` right after `crewReportWorker.close(false)` and before `keywordRankWorker.close(false)`, consistent with the brief's instruction to add them before `current.queue.close()`.
- Concern (out of scope): `infrastructure.test.ts` migration-count assertion is stale after Task 1's migration 015 and should be updated to `[1..15]` in a follow-up. Not fixed here because it belongs to Task 1's scope.
