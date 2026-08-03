### Task 9: Environment variables + `.env.example`

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: the env reads in `tracker-scan-worker.ts` (Task 5) and `actions.ts` (Task 6).
- Produces: documented defaults for the three new variables.

- [ ] **Step 1: Add the new env vars to `.env.example`**

Append inside the existing "Tier B B1 — Recurring keyword rank tracker" block (after `TRACKER_SCAN_CRON=`):

```
# Tier B B3 — Tracker alerts
# Position delta that qualifies as a "significant" drop/rise. Default 3.
TRACKER_ALERT_MIN_DELTA=
# Observation + alert retention window in days. Default 90.
TRACKER_RETENTION_DAYS=
# From address for the daily alert digest email. Default noreply@seovista.com.
TRACKER_ALERTS_FROM_EMAIL=
```

- [ ] **Step 2: Verify no other config references are missing**

Run a quick grep for the new env names in `apps/worker` and `apps/web`:

Run: `Select-String -Path C:\bc-proje\Seovista\apps\worker\src\**\*.ts, C:\bc-proje\Seovista\apps\web\src\**\*.ts -Pattern 'TRACKER_ALERT_MIN_DELTA|TRACKER_RETENTION_DAYS|TRACKER_ALERTS_FROM_EMAIL'`

Expected: matches in `tracker-scan-worker.ts` (Task 5) and `.env.example` (this task).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): document Tier B B3 tracker alert env vars"
```
