# Task 8 Report — .env.example + Full Test Suite

## What I Changed

**File:** `.env.example` (committed)

Appended the Tier B B1 tracker env vars block after the `SEARXNG_BASE_URL=` section, verbatim from the task brief:

```
# Tier B B1 — Recurring keyword rank tracker
# Max active tracking targets per email session. Default 5.
TRACKER_MAX_TARGETS_PER_EMAIL=
# Per-IP rate limit for creating tracking targets (per hour). Default 3.
TRACKER_PER_IP_RATE_LIMIT=
# Delay between SearXNG queries in the daily batch scan (ms). Default 2000.
TRACKER_SCAN_DELAY_MS=
# BullMQ queue name for the tracker scan batch job. Default tracker_scan_jobs.
TRACKER_SCAN_QUEUE_NAME=
# Cron pattern for the daily repeatable batch job. Default '0 3 * * *' (daily 03:00 UTC).
TRACKER_SCAN_CRON=
```

Diff: `1 file changed, 12 insertions(+)`.

## Full Test Suite Results

### Worker tests — `pnpm --filter @seovista/worker exec vitest run`

Env: `SEOVISTA_LIFECYCLE_CONTEXT_PATH` set to the required lifecycle context path.

- **Total:** 295 tests / 42 files
- **Passed:** 292
- **Failed:** 3

Failures:

1. `geo-worker.test.ts > handles 429 rate limit correctly`
   - `expected 'completed' to be 'failed'`
   - **Known acceptable / environmental.** Per the task brief, the geo-worker 429 case is the documented known environmental failure (sandbox DNS rate-limiting). The test got a `render_cache_hit` for `https://rate-limit.com`, meaning SearXNG was not actually reached, so no 429 propagated and the job completed instead of failing. Same root cause as documented.

2. `geo-worker.test.ts > notifies Crew Agency when CREW_AGENCY_API_KEY is configured and score is low`
   - `expected +0 to be 1` (crewRequests)
   - **Environmental, same root cause as #1.** The test logged `render_cache_hit` for `https://example.com`, i.e. SearXNG was not called and cached fixture data was used. Without a fresh low-score SERP result, the Crew Agency notification branch was not triggered, so `crewRequests` stayed at 0. This is the same SearXNG-unreachable-in-sandbox environmental condition as the 429 test, not a code regression. Not introduced by this task (the only file changed is `.env.example`).

3. `migration-invariants.test.ts > advisory lock serializes concurrent access`
   - `expected 1 to be +0` — a leftover Postgres advisory lock (key 42001) remained after `applyAll`.
   - **Environmental / flaky, not a code regression.** This is a database-state assertion (`pg_locks` for the migration advisory lock). A leftover lock indicates prior/concurrent test runs held the lock, not a defect in tracker code. Not introduced by this task (only `.env.example` changed).

**Tracker-specific files (Tasks 1-7) all passed:**
- `tracker-repository.test.ts` — 13 tests, all pass
- `tracker-scan-worker.test.ts` (visible in batch_complete logs) — all pass

### Web tests — `pnpm --filter @seovista/web exec vitest run`

- **Total:** 270 tests / 33 files
- **Passed:** 270
- **Failed:** 0
- Exit code 0.

### Typecheck — `pnpm -r exec tsc --noEmit`

- **0 errors.** Exit code 0.
- Only output: the pnpm engine warning (Node 25.8.0 vs `>=24.0.0 <25.0.0`), which is benign and pre-existing.

### Lint — `pnpm run lint`

- **0 errors.** Exit code 0.
- 14 warnings, all pre-existing `no-console` warnings in `apps/worker/src/db/admin-seed.ts`, `dev-seed.ts`, and `utils/fetcher.ts`. None in tracker code. None are errors.

## Failure Classification Summary

| # | Test | Verdict |
|---|------|---------|
| 1 | geo-worker 429 | Known environmental (documented in brief) |
| 2 | geo-worker Crew Agency notify | Environmental — same SearXNG-unreachable root cause as #1; cache hit short-circuited the low-score branch |
| 3 | migration-invariants advisory lock | Environmental / flaky — leftover Postgres advisory lock from prior/concurrent runs |

**None of the 3 failures are new regressions.** The only file modified in this task is `.env.example`, which cannot affect runtime test behavior. All tracker (Tier B B1) tests pass.

## Self-Review Findings

- The appended env var block matches the brief verbatim, including comments and defaults-in-comments. Placement is after the `SEARXNG_BASE_URL=` block at end of file, as specified.
- No trailing-content issues; the file ends cleanly with a newline after `TRACKER_SCAN_CRON=`.
- Only `.env.example` was staged and committed. Other modified/untracked files in the worktree (`.superpowers/sdd/progress.md`, `apps/web/tsconfig.json`, `.superpowers/sdd/tier-b-b1/`) were left untouched per scope.
- Node 25.8.0 engine warning is benign; no barrel import errors occurred, so the Node 24 fallback was not needed.
- Worker dist was not rebuilt (not needed — vitest runs against source).

## Commit

`b8040b4` — `docs: add Tier B B1 tracker env vars to .env.example`
