# Spec: Tier B — B1 Recurring Rank Tracker (Storage + Scheduler)

**Date:** 2026-08-01
**Status:** Approved (brainstorming complete)
**Parent PRD:** `docs/prd/2026-07-31-keyword-tracking-prd.md` (Tier B)
**Parent authorities:** SeoVista PRD (Later roadmap: Recurring visibility dashboard), Implementation Brief v1 (§12, ADR 0001/0003)
**Depends on:** Tier A Keyword Rank Checker (shipped — SearXNG integration, `serp-provider.ts`)

## 1. Scope

B1 is the first vertical slice of Tier B. It delivers:
- **Storage:** three new tables (`tracker_sessions`, `keyword_targets`, `rank_observations`) via migration 015
- **Scheduler:** a single daily BullMQ repeatable batch job that scans all active tracking targets via SearXNG and records rank observations
- **Minimal tracker view:** `/tracker` form (add target) + `/tracker/[token]` page (list targets, see latest positions, add/remove targets)
- **Entry point integration:** "Bu anahtarı takip et" button on the existing keyword-rank-checker result page

**Out of scope (deferred to B2/B3):**
- Trend charts, delta visualization, historical graph (B2)
- Alerting thresholds, email/in-app notifications (B3)
- Observation retention/cleanup cron (B3)
- Full dashboard with rich analytics (B2)

## 2. Identity Model

**Anonymous-email + on-screen token URL.** No email infrastructure required.

- User enters email + keyword + domain → system creates/looks up `tracker_sessions` row (email UNIQUE, token UNIQUE) → creates `keyword_targets` row → responds with `/tracker/{token}` URL shown on screen
- Token is **persistent and bookmarkable** (not single-use). No email re-send mechanism. User must bookmark the URL.
- `/tracker/{token}` authenticates by token lookup — shows all targets belonging to that session's email
- Security posture: acceptable for B1 (lead-gen tool, non-sensitive SERP data). Token is a `crypto.randomUUID()` — unguessable but anyone with the URL can view the targets.

## 3. Data Model

### Migration 015 — three tables

```sql
CREATE TABLE tracker_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  token      TEXT UNIQUE NOT NULL,  -- crypto.randomUUID()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE keyword_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  domain          TEXT NOT NULL,
  locale          TEXT NOT NULL DEFAULT 'tr-TR',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  UNIQUE(session_id, keyword, domain, locale)
);

CREATE TABLE rank_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id       UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,  -- 0 = not found in results
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  top_competitors JSONB NOT NULL DEFAULT '[]'::jsonb  -- [{rank:1, domain:"example.com"}, ...] top-10
);

CREATE INDEX idx_keyword_targets_active ON keyword_targets(active) WHERE active = true;
CREATE INDEX idx_rank_obs_target_checked ON rank_observations(target_id, checked_at DESC);
```

### Constraints

- **Max targets per email:** `TRACKER_MAX_TARGETS_PER_EMAIL` env var, default 5. Enforced in `createTrackingTarget` server action. Prevents abuse of the free scheduler.
- **Duplicate prevention:** `UNIQUE(session_id, keyword, domain, locale)` — same keyword+domain+locale can't be added twice for the same session.
- **Observation retention:** no automatic cleanup in B1 (YAGNI). B3 will add a 90-day retention cron.

## 4. Architecture

### 4.1 Web (apps/web)

**Routes:**
- `/tracker` — standalone add-target form (email + keyword + domain + locale dropdown). On submit, shows token URL. Server Component with Client Component form.
- `/tracker/[token]` — authenticated tracker dashboard (B1 minimal). Shows: target table (keyword, domain, last position, last checked, status), mini history list (last 7 observations per target), add-target form, deactivate button. Server Component.

**Entry point integration:**
- `keyword-rank-checker/result/[jobId]/page.tsx` — add "Bu anahtarı takip et" button in the completed result branch. Clicking opens an inline email form (Client Component). On submit, calls `createTrackingTarget` with the keyword + domain from the completed job's result, then shows the token URL.

**Server actions (`apps/web/src/lib/tracker/actions.ts`):**
- `createTrackingTarget({ email, keyword, domain, locale? })` — Zod validation, rate limit check (bucket "tracker-create"), session lookup-or-create, max-targets enforcement, INSERT keyword_target, return `{ token, targetId }`
- `listTrackerTargets({ token })` — token lookup → session → all targets + latest observation per target + last 7 observations
- `deactivateTarget({ token, targetId })` — verify token owns target, set `active = false` (soft delete, observations retained)

**Rate limiting:**
- `TRACKER_PER_IP_RATE_LIMIT` env var, default 3/hour. Uses `checkIpRateLimit` with bucket "tracker-create". Separate from the existing crew-report and geo-audit buckets.
- Uses the hardened `extractClientIp` (last XFF entry, S2 fix).

**Validation (`apps/web/src/lib/tracker/validation.ts`):**
- Zod schemas: email (valid email), keyword (1-200 chars), domain (valid URL/hostname), locale (enum: tr-TR, en-US — start minimal)

### 4.2 Worker (apps/worker)

**Queue + scheduler:**
- `tracker_scan` BullMQ queue
- Repeatable job: pattern `{ pattern: '0 3 * * *' }` (daily 03:00 UTC), single batch job
- Registered in `worker.ts` alongside existing queues

**Processor (`apps/worker/src/processors/tracker-scan.ts`):**
1. Query all `active = true` keyword_targets (ordered by last_checked_at NULLS FIRST — oldest checks first)
2. For each target:
   a. Call SearXNG via the existing `serp-provider.ts` query function (reused from Tier A keyword-rank-checker)
   b. Parse SERP results → find target domain's position (same logic as keyword-rank processor)
   c. Extract top-10 competitor domains
   d. INSERT `rank_observations` row (position, top_competitors JSONB)
   e. UPDATE `keyword_targets.last_checked_at`
   f. Delay 2 seconds before next target (SearXNG rate-limit courtesy, `TRACKER_SCAN_DELAY_MS` env, default 2000)
3. Structured log: `{ targets_scanned, successes, failures, duration_ms }`
4. Error handling: single target failure → log error, continue batch (one target doesn't kill the run). SearXNG 429 → pause batch, log, exit (next daily run retries).

**Job records:**
- Uses the existing `job_records` / `job_results` pattern for auditability
- `queue_name = 'tracker_scan'`, `target = 'batch'` (not per-target)
- `job_results` payload: `{ kind: 'tracker-scan', scanned, successes, failures, durationMs }`

**Missed-run handling:** BullMQ repeatable default — if the worker is down at 03:00 UTC, the missed run is not retried. The next scheduled run fires normally. No catch-up logic in B1.

### 4.3 SERP Source

Reuses Tier A's SearXNG integration (`apps/worker/src/processors/serp-provider.ts`):
- Same SearXNG query function (build URL, fetch, parse results)
- Same domain-position extraction logic (normalize domain, match against result URLs)
- Same `SEARXNG_BASE_URL` env var
- No new SERP dependency — SearXNG is self-hosted at Coolify

## 5. Minimal Tracker View (B1)

`/tracker/[token]` renders:

- **Target table:** keyword, domain, locale, last position (or "Henüz kontrol edilmedi"), last checked date, active/pasif badge
- **Mini history:** per target, last 7 observations as a compact list (date → position). No chart (B2).
- **Add target form:** email is implicit (from session), just keyword + domain + locale. Calls `createTrackingTarget`.
- **Deactivate button:** per target, sets `active = false`. Observations retained.
- **No AI content label:** this is SERP data (real positions), not AI-generated content. Honesty rules: no fabricated metrics.

## 6. Component Breakdown

| Component | Location | Responsibility |
|---|---|---|
| `tracker-form.tsx` | `apps/web/src/components/tracker/` | Client component: email + keyword + domain form, submit, show token URL |
| `tracker-dashboard.tsx` | `apps/web/src/components/tracker/` | Client component: target table, add form, deactivate buttons |
| `actions.ts` | `apps/web/src/lib/tracker/` | Server actions: createTarget, listTargets, deactivateTarget |
| `validation.ts` | `apps/web/src/lib/tracker/` | Zod schemas for tracker inputs |
| `tracker-repository.ts` | `apps/worker/src/utils/` | DB queries: session lookup/create, target insert, active targets query, observation insert. Web imports via `@seovista/worker` (same pattern as `createGeoAuditRepository`). |
| `tracker-scan.ts` | `apps/worker/src/processors/` | Batch processor: iterate targets → SearXNG → observations |
| `tracker-scan-submission.ts` | `apps/worker/src/queue/` | Repeatable job registration + queue setup |
| `tracker-scan-worker.ts` | `apps/worker/src/queue/` | Worker registration, poll loop, error handling |

## 7. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRACKER_MAX_TARGETS_PER_EMAIL` | 5 | Max active targets per email session |
| `TRACKER_PER_IP_RATE_LIMIT` | 3 | Create-target requests per IP per hour |
| `TRACKER_SCAN_DELAY_MS` | 2000 | Delay between SearXNG queries in batch scan |
| `TRACKER_SCAN_QUEUE_NAME` | `tracker_scan` | BullMQ queue name |
| `TRACKER_SCAN_CRON` | `0 3 * * *` | BullMQ repeatable cron pattern (daily 03:00 UTC) |

All added to `.env.example` with deployment shapes.

## 8. Error Handling

- **SearXNG unreachable:** batch job logs error, exits. Next daily run retries. Individual target failures don't abort the batch.
- **SearXNG 429 (rate limited):** batch pauses, logs, exits. No retry within the same run (courtesy to self-hosted SearXNG).
- **Invalid token:** `/tracker/[token]` returns 404 (not a data leak — don't confirm whether token exists).
- **Max targets exceeded:** `createTrackingTarget` returns validation error (Turkish: "Bu e-posta için maksimum hedef sayısına ulaştınız").
- **Duplicate target:** `createTrackingTarget` returns validation error (Turkish: "Bu anahtar kelime zaten takip ediliyor").

## 9. Testing Strategy

### Unit Tests
- `tracker-repository.test.ts`: session lookup (new/existing email), target insert (unique constraint), max-targets enforcement, active targets query, observation insert
- `tracker-scan.test.ts`: batch processor with mocked SearXNG → correct position parsing, observation insert, last_checked_at update, single-target failure continues batch, 429 pauses batch
- `validation.test.ts`: Zod schema acceptance/rejection cases
- `actions.test.ts`: createTrackingTarget (rate limit, max targets, duplicate), listTrackerTargets (token lookup, 404 on invalid), deactivateTarget (ownership check)

### Integration Tests
- `/tracker` page render + form submit → DB row created + token URL shown
- `/tracker/[token]` page render → targets + observations displayed
- keyword-rank-checker result "takip et" button → creates target with job's keyword+domain

### Scheduler Tests
- Repeatable job registration (mock BullMQ `queue.add` with repeat pattern)
- Missed-run behavior (no catch-up — single run at next scheduled time)

### E2E (Playwright, deferred to CI)
- `/tracker` form → target create → token URL → navigate → see target
- keyword-rank result → "takip et" → token URL → navigate → see target

## 10. Honest Content Rules

- Rank observations are real SERP data from SearXNG — no fabricated positions
- No AI-generated content in B1 (the AI Strategy Report is a separate feature)
- No "ranking factor" claims — positions are factual observations
- Target data (keyword, domain) is user-provided, not fabricated

## 11. Out of Scope (Explicitly Deferred)

- **B2 (Dashboard):** trend charts, delta visualization, historical graph, CSV export
- **B3 (Alerts):** threshold-based notifications (email/in-app), position drop alerts, observation retention cron (90-day cleanup)
- **Railway staging:** deferred by user ("şimdilik gerek yok, lokal yeterli")
- **Email delivery:** no email provider (on-screen token URL only)
- **Authenticated accounts:** no password/OAuth (anonymous-email + token only)
- **Per-target configurable frequency:** all targets share the single daily batch
- **Cost ledger:** SearXNG is self-hosted (no per-query cost); DataForSEO cost ceiling from PRD §12 not applicable

## 12. Migration

Migration 015 creates the three tables. Runs via existing `db:bootstrap` / migration runner. Down migration drops all three tables (CASCADE).
