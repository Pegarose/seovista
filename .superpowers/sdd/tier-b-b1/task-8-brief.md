## Task 8: .env.example + Full Test Suite

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add tracker env vars to .env.example**

Add the following block at the end of `.env.example` (after the `SEARXNG_BASE_URL=` section):

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

- [ ] **Step 2: Run the full worker test suite**

Run: `pnpm --filter @seovista/worker exec vitest run`
Expected: All tests pass. Known acceptable failure: geo-worker 429 (environmental).

- [ ] **Step 3: Run the full web test suite**

Run: `pnpm --filter @seovista/web exec vitest run`
Expected: All tests pass.

- [ ] **Step 4: Run typecheck across the workspace**

Run: `pnpm -r exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Run lint**

Run: `pnpm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "docs: add Tier B B1 tracker env vars to .env.example

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```
