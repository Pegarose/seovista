# Debt Fixes Before Keyword Tracking — Implementation Plan

**Goal:** Close the blocking debt set identified by the 2026-07-31 audit before Keyword Tracking copies the template: S1+S3 (SSRF/body cap), B1+B2 (queue lifecycle), B3+B4 (action/result template bugs), working-tree cleanup (U1-U9), M7 (.env.example).

**Constraint set:** Node 24 LTS at `C:\Users\BCX\.config\herd\bin\nvm\v24.12.0`; `corepack pnpm@10.30.1`; TS strict; TDD; don't touch unrelated working-tree changes; Turkish UI strings unchanged.

---

### Fix A — SSRF redirect revalidation + body size cap (worker, security)

**Files:**
- Modify: `apps/worker/src/utils/fetcher.ts`
- Test: extend `apps/worker/src/utils/__tests__/fetcher.test.ts` (or create if the fetch paths lack tests)

**Contract:**
1. Introduce `fetchWithValidatedRedirects(url, { maxHops = 5, maxBodyBytes, timeoutMs, headers }): Promise<{ body: string; finalUrl: string; status: number }>` in `fetcher.ts`:
   - `redirect: "manual"`; loop up to maxHops following 301/302/303/307/308 `Location` (resolve relative against current URL); **run `validateSSRF` on every hop URL before requesting it**; reject >maxHops with typed error.
   - Stream the body and abort when exceeding `maxBodyBytes` (read via `response.body.getReader()`, accumulate chunks, throw typed `BodyTooLargeError` past the cap).
2. `fetchTextSafely` delegates to it with `maxBodyBytes = 500 * 1024` (RFC 9309 500 KiB guidance).
3. The main page-fetch path (`fetchViaCheerio`, fetcher.ts:442-452) also delegates, `maxBodyBytes = 2 * 1024 * 1024`, preserving its existing behavior otherwise (keep cheerio path intact; only the fetch call changes).
4. DNS-TOCTOU residual: re-resolution happens per hop through validateSSRF; document in a comment that connect-time DNS pinning is out of scope for the mock-era posture (Sprint 0 deterministic mocks, no live provider traffic per AGENTS.md).
5. Errors: typed errors (`SsrfRedirectBlockedError`, `TooManyRedirectsError`, `BodyTooLargeError`) so processors can map them to permanent vs timeout failure classes.

**Tests:** redirect to private IP blocked; >5 hops rejected; body past cap rejected; relative redirect resolution; happy path single + multi-hop.

---

### Fix B — Queue lifecycle: transition graph + orphaned rows (worker + migration)

**Files:**
- Create: `apps/worker/migrations/006_extend_job_status_transitions.sql` (check the highest existing migration number first; follow repo migration conventions)
- Modify: `apps/worker/src/queue/schema-submission.ts`, `ai-crawler-submission.ts` (compensation path)
- Test: extend/create migration + submission tests

**Contract:**
1. Migration: extend the transition graph (see `002_create_job_status_transitions.sql:13-18`) to allow `queued → permanent`, `queued → timeout` (and `queued → failed` if missing) so the worker catch-path UPDATE stops being rejected by `job_transition_trigger` (`003_...sql:44-74`). Migration must be idempotent per repo conventions.
2. Compensation: in both submission queues, wrap `queue.add(...)` in try/catch; on failure after the web-side INSERT committed, DELETE the orphaned `job_records` row (by job id) before rethrowing — leaving no permanent 'queued' row. Keep the error contract to the caller unchanged.
3. Note for future: document (code comment) that a transactional outbox is the long-term pattern; the DELETE compensation is the minimal correct fix.

**Tests:** submission test with mocked `queue.add` rejection → job_records row removed, error surfaced; migration test per existing migration test conventions (or manual SQL verification documented if no harness exists).

---

### Fix C — Action/result template bugs (web)

**Files:**
- Modify: `apps/web/src/lib/{schema-checker,ai-crawler-checker,geo-checker}/actions.ts` (B3)
- Modify: `apps/web/app/tools/{schema-checker,ai-crawler-checker}/result/[jobId]/page.tsx` (B4)
- Create: `apps/web/src/lib/admin/job-result-guard.ts` or similar shared helper (B4 extraction)
- Test: extend action tests + result-page tests

**Contract:**
1. B3: move `getAdminDb()` inside the try block in all three action modules so a missing `DATABASE_URL` yields the existing 503-contract response instead of an unhandled 500. Match each file's existing error contract shape exactly.
2. B4: extract the geo result page's correct pattern (`normalizeAuditStatusRecord` + explicit `unknown` branch, `geo-readiness-checker/result/[jobId]/page.tsx:157-170`) into a shared helper; apply to schema + ai-crawler result pages so unexpected status renders the explicit-unknown UI instead of crashing on `payload!`. Do NOT refactor the geo page itself in this pass (avoid scope creep) — just extract the shared helper for the two new pages.

**Tests:** action test with `DATABASE_URL` unset → 503 contract; result-page test with unknown status → explicit-unknown UI renders, no crash.

---

### Fix D — Working-tree cleanup + .env.example

**Files:** pre-existing uncommitted changes only + `.env.example`

**Contract:**
1. Fix `tests/infrastructure/e2e-wrapper.test.ts:1-2` duplicate `import { EventEmitter }` (TS2300), then commit in logical changesets:
   - U1: `apps/web/src/lib/geo-checker/actions.ts` — `fix(web): rethrow NEXT_REDIRECT in geo-checker action`
   - U2+U3: score-breakdown + geo-engine semantic — `feat(geo): localize issue messages to Turkish`
   - U4: content-intelligence — `feat(content-intelligence): reject malformed payloads with typed error`
   - U5+U6: e2e wrapper + test — `test(infra): rewrite e2e wrapper with deterministic teardown and tests`
2. Revert U7: `apps/web/tsconfig.json` churn (`git checkout -- apps/web/tsconfig.json`).
3. Delete `.tmp/review-packages/*` (ephemeral artifacts) and add `.tmp/` to `.gitignore`.
4. `.env.example`: add documented entries for `SCHEMA_QUEUE_NAME`, `AI_CRAWLER_QUEUE_NAME`, `SCHEMA_WORKER_CONCURRENCY`, `AI_CRAWLER_WORKER_CONCURRENCY`, `GEO_WORKER_CONCURRENCY`, `BROWSERACT_API_KEY`, `BROWSERACT_WORKFLOW_ID`, `BROWSERACT_API_URL` (grep the code for exact consumed names/defaults first; document defaults).

**Validation (all fixes):** `corepack pnpm@10.30.1 --filter @seovista/worker test`, `--filter @seovista/web test`, `--filter @seovista/content-intelligence test`, `--filter @seovista/geo-engine test`, workspace `typecheck` 0, `lint` 0 (pre-existing 14 worker warnings acceptable, no new ones).

**Execution order:** A, B, C in parallel (disjoint file sets) → D after all land → final verification.
