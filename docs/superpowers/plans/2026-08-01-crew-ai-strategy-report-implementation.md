# CrewAgency AI Strategy Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email-gated "AI Strateji Raporu" section on the four job-backed tool result pages. CrewAgency client (X-API-Key, kickoff/poll) + `crew_report_jobs` queue chain + lead-gated action + bespoke markdown report view with guardrail badges.

**Spec:** `docs/superpowers/specs/2026-08-01-crew-ai-strategy-report-design.md` (authoritative for architecture/component contracts).

**Reference implementations to mirror:** `apps/worker/src/queue/keyword-rank-submission.ts` + `keyword-rank-worker.ts` (queue chain), `apps/worker/src/utils/serp-provider.ts` (typed-error client pattern), `apps/web/src/lib/geo-checker/actions.ts` (lead capture: `createGeoAuditRepository(db)`, `createLead`, `updateLeadEmailForJob`, `checkJobStatusAction`), `apps/web/src/components/geo-checker/audit-poller.tsx` (polling component).

## Global Constraints

- Node 24 at `C:\Users\BCX\.config\herd\bin\nvm\v24.12.0` on PATH; `corepack pnpm@10.30.1`; TS strict; TDD (red first).
- Turkish UI; one `<h1>` per page (report section uses `<h2>`); WCAG 2.1 AA (badges = text + color).
- No mock/fallback report content; guardrail labels never stripped; API key never leaves the server.
- Queue contract: BullMQ queue `crew_report_jobs` (env `CREW_REPORT_QUEUE_NAME`), job name `crew_report`, job_records `queue_name='crew_report'`, result_type `'crew-report:result'`, concurrency env `CREW_REPORT_WORKER_CONCURRENCY` default 3.
- Worker tests: reuse dev stack via `SEOVISTA_LIFECYCLE_CONTEXT_PATH=C:\bc-proje\Seovista\.lifecycle-evidence\seovista-run-fb867d236f9d-context.json`; Docker CLI is policy-blocked; known acceptable failure: geo-worker 429 DNS wildcard.
- Do NOT touch unrelated working-tree changes; commit only your task's files with explicit paths.

---

### Task 1: CrewAgency API client (worker)

**Files:**
- Create: `apps/worker/src/utils/crew-agency-client.ts`
- Test: `apps/worker/src/__tests__/crew-agency-client.test.ts`

**Interfaces:**
- Produces: `CrewAgencyClient`, `CrewAgencyError` (codes `crew.auth | crew.rate_limited | crew.unavailable | crew.timeout`, `retryable`), `resolveCrewAgencyClient(env)`, types `CrewJobStatus`.

- [ ] **Step 1: Write the failing test** (inject `fetchImpl`; no real network):
  - constructor: rejects non-http(s) baseUrl and empty apiKey (`crew.misconfigured` acceptable as a 5th code)
  - `kickoff("/api/rapor-uret", body)` → POST to `{base}/api/rapor-uret` with `X-API-Key` + JSON body; accepts response `{ job_id }` and `{ jobId }`
  - 401/403 → `crew.auth` (retryable false); 429 → `crew.rate_limited` (true); 503 → `crew.unavailable` (true); abort → `crew.timeout` (true)
  - `getJob("id")` → GET `/api/jobs/id`; parses `{ status: "completed", result }`, `{ status: "failed", error }`, and in-flight statuses; unknown status strings pass through as-is
  - `resolveCrewAgencyClient({})` → null; with both envs → client
- [ ] **Step 2: Verify red** — `corepack pnpm@10.30.1 --filter @seovista/worker exec vitest run src/__tests__/crew-agency-client.test.ts`
- [ ] **Step 3: Implement** — mirror serp-provider.ts patterns (AbortSignal.timeout 15s default, `readBodyWithCap`-style 1 MiB cap or simple text() with length guard, typed errors). `CrewJobStatus = { status: string; result?: unknown; error?: string }`. `kickoff` requires the response JSON to contain a job id string, else `crew.unavailable`.
- [ ] **Step 4: Verify green** (single-file vitest run is fine for this task).
- [ ] **Step 5: Commit** — `feat(worker): add CrewAgency API client with typed error mapping`

---

### Task 2: Queue chain + processor + rate-limit bucket

**Files:**
- Create: `apps/worker/src/processors/crew-report.ts`
- Create: `apps/worker/src/queue/crew-report-submission.ts`
- Create: `apps/worker/src/queue/crew-report-worker.ts`
- Modify: `apps/worker/src/utils/rate-limiter.ts` (optional `bucket` param, backwards compatible — READ it first)
- Modify: `apps/worker/src/worker.ts` (register `startCrewReportWorker`; close first in shutdown)
- Modify: `apps/worker/src/index.ts` (exports)
- Modify: `.env.example` (`CREW_REPORT_PER_IP_RATE_LIMIT`, `CREW_REPORT_QUEUE_NAME`, `CREW_REPORT_WORKER_CONCURRENCY` in the queue section)
- Tests: `apps/worker/src/__tests__/crew-report-processor.test.ts`, `crew-report-submission.test.ts`, `rate-limiter-bucket.test.ts`

**Interfaces:**
- Consumes: Task 1 client; source payloads via job_results correlation join.
- Produces: `CREW_REPORT_TOOLS`, `CrewReportTool`, `TOOL_QUEUE_NAMES`, `buildCrewReportRequest`, `buildCrewReportResultPayload`, `submitCrewReport` (+ close/reset), `CREW_REPORT_QUEUE_NAME`, `CREW_REPORT_JOB_NAME`, `CREW_REPORT_JOB_RECORD_QUEUE_NAME`, `startCrewReportWorker`, `getCrewReportWorkerConcurrency`.

- [ ] **Step 1: Write failing tests**
  - processor: `buildCrewReportRequest({ tool: "keyword-rank", sourcePayload: { domain: "example.com", keyword: "seo", locale: "tr-TR", position: 3, top10: [...] } })` → `{ endpoint: "/api/seo-brief", body: { konu: "seo", brand_context: "example.com", dil: "tr" } }`; audit tools (geo-readiness/schema/ai-crawler) → `/api/rapor-uret` with `body.dil === "tr"` and `brand_context` a non-empty string ≤ 4000 chars containing the target; unknown tool → throw. `buildCrewReportResultPayload` → `{ kind: "crew-report", dataSource: "crew-agency", ... }`, no `score` property.
  - submission: mirror keyword-rank-submission.test.ts (happy path INSERT uses `queue_name 'crew_report'` + job data `{ jobId, sourceJobId, tool }`; enqueue rejection → DELETE compensation + same error rethrown).
  - rate limiter: existing callers unaffected (no bucket → same key as before); with `bucket: "crew-report"` a different Redis key is used (assert via mocked ioredis).
- [ ] **Step 2: Verify red** — worker suite (lifecycle context).
- [ ] **Step 3: Implement**
  - `processors/crew-report.ts`: tool union + queue-name map; context summarizer per tool (target/domain + score when present + up to 10 key findings/issues; keyword-rank: keyword/domain/locale/position + top 3 rivals; truncate to 4000 chars with ellipsis marker); request builder per spec §3.1; result payload builder (`checkedAt`/`generatedAt` ISO strings).
  - `rate-limiter.ts`: add optional `bucket?: string` to the input; key becomes `${existingPrefix}${bucket ? ":" + bucket : ""}:${ip}` (READ the existing key shape first and keep it identical when bucket is absent).
  - `crew-report-submission.ts` / `crew-report-worker.ts`: mirror keyword-rank files. Worker handler: `running` UPDATE → resolveCrewAgencyClient (null → throw `crew.misconfigured` → permanent) → load source payload via `SELECT r.payload FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1` (TOOL_QUEUE_NAMES[tool]) → buildCrewReportRequest → kickoff → poll loop: 5s interval, 10 min ceiling (use a fake-timer-friendly injected `sleep` for tests); crew status `completed` → buildCrewReportResultPayload → INSERT `crew-report:result` → `completed` UPDATE. Catch mapping: `crew.auth`/`crew.misconfigured` → permanent; `crew.timeout`/`crew.unavailable`/`crew.rate_limited`/poll-ceiling → timeout; else failed.
  - Registration + exports + `.env.example`.
- [ ] **Step 4: Verify green** — worker suite (only known env failure), workspace `typecheck` 0, worker `lint` 0 errors.
- [ ] **Step 5: Commit** — `feat(worker): add crew report queue chain with CrewAgency polling and rate-limit buckets`

---

### Task 3: Web actions + gated section + result page integration

**Files:**
- Create: `apps/web/src/lib/crew-report/validation.ts`
- Create: `apps/web/src/lib/crew-report/actions.ts`
- Create: `apps/web/src/components/crew-report/crew-report-section.tsx`
- Modify: 4 result pages — `apps/web/app/tools/{geo-readiness-checker,schema-checker,ai-crawler-checker,keyword-rank-checker}/result/[jobId]/page.tsx` (mount `<CrewReportSection>` below completed content only)
- Tests: `apps/web/src/lib/crew-report/__tests__/actions.test.ts`, `apps/web/src/components/crew-report/__tests__/crew-report-section.test.tsx`

**Interfaces:**
- Consumes: `submitCrewReport`, `checkIpRateLimit` (bucket), `createGeoAuditRepository` (@seovista/worker); `getAdminDb`, `normalizeJobResultStatus` (web libs); `extractClientIp`.
- Produces: `startCrewReportAction`, `checkCrewReportStatusAction`, `CrewReportSection({ sourceJobId, tool })`, type `CrewReportActionState`.

- [ ] **Step 1: Write failing tests**
  - actions (mirror keyword-rank action test conventions): invalid email / missing consent / bad UUID / unknown tool → error states; rate-limit exceeded → Turkish form error; `CREW_AGENCY_API_URL`/`_KEY` unset → honest "yapılandırılmadı" error (NOT a throw, no submit call); source job not completed → error; happy path → `createLead` + `submitCrewReport` + `updateLeadEmailForJob` called in order, returns `{ status: "started", crewJobId }`; DATABASE_URL unset → system-error contract.
  - section (happy-dom pragma): locked state renders email + consent + submit; successful submit switches to in-flight (poller calls status action); completed status renders report region; failed renders retry. Mock both actions via `vi.mock`.
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement**
  - `validation.ts`: Zod — sourceJobId UUID, tool enum (`geo-readiness | schema | ai-crawler | keyword-rank`), email `z.string().trim().email("Geçerli bir e-posta giriniz.")`, consent `z.literal(true, { message: "Devam etmek için onay gereklidir." })`.
  - `actions.ts`: `"use server"`; follow the keyword-rank action structure (getAdminDb-in-try comment, REDIS_URL guard, extractClientIp, NEXT_REDIRECT digest rethrow pattern even though no redirect — keep for consistency). Rate limit via `checkIpRateLimit({ redisUrl, ip, limit, bucket: "crew-report" })`, `CREW_REPORT_PER_IP_RATE_LIMIT` default 5. Env gate BEFORE rate limit: if crew envs missing return `{ status: "error", errors: { form: ["AI strateji raporu servisi henüz yapılandırılmadı."] } }`. Source-job verification via `createGeoAuditRepository(db).getJobRecord(sourceJobId)` + `normalizeJobResultStatus` === "completed" (geo repository reads job_records by id without queue filter — verify on disk). Happy path order: createLead(`{ domain: <job.target ?? "unknown">, brandName: "SeoVista Tools", primaryMarket: "tr" }`) → submitCrewReport → updateLeadEmailForJob(crewJobId, lead.id, email, consent) → `{ status: "started", crewJobId }`.
  - `checkCrewReportStatusAction(crewJobId)`: mirror `checkJobStatusAction`; on completed also return the parsed `crew-report:result` payload (join job_results via correlation_id, queue filter `crew_report`); never return lead data.
  - `crew-report-section.tsx`: client component; `useActionState` for the gate form; on `started` begin polling `checkCrewReportStatusAction` every 3s (cleanup on unmount); states locked/in-flight/completed/failed with Turkish copy; renders `<CrewReportView>` (Task 4 — for this task render a minimal placeholder div with `data-testid="crew-report-content"` containing `report.reportMarkdown`, replaced in Task 4).
  - Result pages: add `<CrewReportSection sourceJobId={jobId} tool="…" />` inside the completed branch only, below existing content (import from components; geo page's completed view, schema/ai-crawler/keyword-rank pages' completed views). Tool values: `geo-readiness`, `schema`, `ai-crawler`, `keyword-rank`.
- [ ] **Step 4: Verify green** — full `@seovista/web test`, `typecheck` 0, `lint` 0.
- [ ] **Step 5: Commit** — `feat(web): add email-gated crew report section to tool result pages`

---

### Task 4: Report view — bespoke markdown rendering + guardrail badges

**Files:**
- Create: `apps/web/src/components/crew-report/guardrail.ts`
- Create: `apps/web/src/components/crew-report/crew-report-view.tsx`
- Modify: `apps/web/src/components/crew-report/crew-report-section.tsx` (swap placeholder → CrewReportView)
- Modify: `apps/web/package.json` (add `react-markdown`, `remark-gfm` — React 19 compatible majors; run `corepack pnpm@10.30.1 install`)
- Test: `apps/web/src/components/crew-report/__tests__/crew-report-view.test.tsx`

**Interfaces:**
- Produces: `GUARDRAIL_LABELS`, `transformGuardrailLabels(markdown)`, `CrewReportView({ report: { reportMarkdown, generatedAt, endpoint } })`.

- [ ] **Step 1: Write failing tests** (happy-dom pragma; renderToStaticMarkup or RTL):
  - `[SİMÜLASYON]` in markdown → badge with text "Simülasyon" present; all five labels map to their Turkish badge text
  - unknown `[SOMETHING]` bracket text → left as plain text (no badge)
  - headings/lists/tables render through the custom map (assert `font-display` class on an h2, list renders `<li>`)
  - injection safety: markdown containing `<script>alert(1)</script>` and `<img onerror=...>` → no script/img tag in output (raw HTML disabled)
  - header band contains "CrewAgency" and the generatedAt string; disclaimer sentence about AI-generated content present
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement**
  - `guardrail.ts`: `GUARDRAIL_LABELS: Record<string, { label: string; tone: "amber" | "blue" | "red" | "green" | "slate"; description: string }>` for the five labels; `transformGuardrailLabels(md)` replaces `[ETIKET]` (only known ones, uppercase Turkish-aware match) with `**⟦G:ETIKET⟧**`.
  - `crew-report-view.tsx`: `react-markdown` + `remark-gfm`, custom `components` map: h2 → `font-display text-xl font-bold text-slate-900 mt-6`, h3 → smaller variant, p → `text-sm text-slate-700 leading-relaxed`, ul/li → spaced list with marker styling, table → wrapped in `overflow-x-auto` slate card, blockquote → amber left-border note, code/pre → slate mono block, a → **render as plain text with break-all** (no outbound links from AI content — safer) or `rel="nofollow noopener" target="_blank"`; `strong` → if content matches `⟦G:LABEL⟧` render badge chip (`inline-flex` rounded-full, tone classes, label + `title={description}`), else normal strong. Raw HTML disabled (react-markdown default — do NOT add rehype-raw). Header band + disclaimer per spec §3.2.
  - Swap the section placeholder for `<CrewReportView report={...} />`.
- [ ] **Step 4: Verify green** — full `@seovista/web test`, `typecheck` 0, `lint` 0.
- [ ] **Step 5: Commit** — `feat(web): render crew reports with bespoke markdown view and guardrail badges`
