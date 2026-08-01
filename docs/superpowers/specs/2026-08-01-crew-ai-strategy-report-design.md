# Design Spec: CrewAgency AI Strategy Report on Tool Results

**Date:** 2026-08-01
**Status:** Approved by user (architecture A, email gate, designed report rendering)
**Integration target:** CrewAgency multi-agent platform (`CREW_AGENCY_API_URL`, X-API-Key auth, async kickoff → `GET /api/jobs/{id}` polling, 503 fail-closed, guardrail labels)

---

## 1. Purpose

Add an email-gated "AI Strateji Raporu" section to the four job-backed tool result pages (GEO Readiness, Schema, AI Crawler, Keyword Rank). The section sends the completed audit context to CrewAgency (audit tools → `POST /api/rapor-uret`, keyword rank → `POST /api/seo-brief`), captures a lead, and renders the returned markdown report in a bespoke SeoVista-designed view with guardrail labels preserved as badges.

## 2. Architecture (approved option A — queue template)

```
[Result page — CrewReportSection (client)]
  Locked state: email + consent form
    → startCrewReportAction(sourceJobId, tool, email, consent)
        (Zod validate → rate limit → verify source job → createLead +
         updateLeadEmailForJob via geo repository → job_records 'crew_report'
         → BullMQ 'crew_report_jobs')
  Worker (crew-report-worker):
    → load SOURCE job payload from job_results (tool → queue_name mapping)
    → buildCrewReportRequest (pure processor): context summary + endpoint mapping
    → CrewAgencyClient.kickoff(endpoint, body) → internal poll 5s, 10min ceiling
    → job_results 'crew-report:result' { kind, sourceJobId, tool, endpoint,
      reportMarkdown, crewJobId, generatedAt, dataSource: "crew-agency" }
  Section polls checkCrewReportStatusAction(crewJobId)
    → completed: CrewReportView (custom markdown component map + guardrail badges)
```

API key lives only in the worker (and web action's env-presence gate). No client-side crew contact. **No mock report** — when `CREW_AGENCY_API_URL`/`CREW_AGENCY_API_KEY` are unset the action returns an honest "service not configured" form error; the worker maps missing config to `permanent`.

## 3. Components

### 3.1 Worker

- `utils/crew-agency-client.ts`: `CrewAgencyClient({ baseUrl, apiKey, fetchImpl?, timeoutMs? })` — constructor validates http/https + non-empty key; `kickoff(path, body)` → `{ jobId }` (accepts `job_id`/`jobId`); `getJob(jobId)` → `{ status, result?, error? }` (unknown statuses treated as in-flight). Typed `CrewAgencyError` codes: `crew.auth` (401/403), `crew.rate_limited` (429), `crew.unavailable` (503/other non-OK/network), `crew.timeout` (15s default). `resolveCrewAgencyClient(env)` → client or null.
- `processors/crew-report.ts` (pure): `CREW_REPORT_TOOLS` union (`geo-readiness | schema | ai-crawler | keyword-rank`); `TOOL_QUEUE_NAMES` mapping (`geo_audit`, `schema_audit`, `ai_crawler_audit`, `keyword_rank_audit`); `buildCrewReportRequest({ tool, sourcePayload })` → `{ endpoint, body }` (audit tools → `/api/rapor-uret` with `{ brand_context: <summarized context ≤4000 chars>, dil: "tr" }`; keyword-rank → `/api/seo-brief` with `{ konu: keyword, brand_context: domain, dil: "tr" }`); `buildCrewReportResultPayload(...)` → persisted payload (no score).
- `queue/crew-report-submission.ts`: mirrors keyword-rank-submission (queue `crew_report_jobs`, job name `crew_report`, job_records queue_name `crew_report`, orphan compensation). Job data `{ jobId, sourceJobId, tool }`.
- `queue/crew-report-worker.ts`: mirrors keyword-rank-worker; loads source payload (correlation join filtered by `TOOL_QUEUE_NAMES[tool]`), kickoff, 5s/10min internal poll, terminal mapping (`crew.auth` → permanent; `crew.timeout/unavailable/rate_limited` → timeout; poll ceiling → timeout).
- `worker.ts` registration + `index.ts` exports. `utils/rate-limiter.ts`: add optional backwards-compatible `bucket` param so crew reports get their own per-IP bucket (`CREW_REPORT_PER_IP_RATE_LIMIT`, default 5).
- `.env.example`: document `CREW_REPORT_PER_IP_RATE_LIMIT` (CREW_AGENCY_* entries already exist).

### 3.2 Web

- `src/lib/crew-report/validation.ts` (no "use server"): Zod — `sourceJobId` UUID, `tool` enum, `email` email, `consent` literal true (KVKK).
- `src/lib/crew-report/actions.ts`:
  - `startCrewReportAction(prev, formData)` → rate limit (namespaced bucket) → env-presence gate (honest Turkish "servis henüz yapılandırılmadı" error) → verify source job completed (geo repository `getJobRecord`) → `createLead({ domain: <source target>, brandName: "SeoVista Tools", primaryMarket: "tr" })` → `submitCrewReport` → `updateLeadEmailForJob(crewJobId, leadId, email, consent)` → `{ status: "started", crewJobId }`.
  - `checkCrewReportStatusAction(crewJobId)` → mirrors `checkJobStatusAction` (getAdminDb-in-try, normalizeJobResultStatus) but returns the parsed report payload when completed.
- `src/components/crew-report/crew-report-section.tsx` ("use client"): three states — locked (email+consent form), in-flight (poller, 3s interval), completed/failed. Props: `sourceJobId`, `tool`.
- `src/components/crew-report/crew-report-view.tsx` + `guardrail.ts`: `GUARDRAIL_LABELS` map (SİMÜLASYON→"Simülasyon", TAHMİN→"Tahmin", VERİ EKSİK→"Veri Eksik", KARAR GEREKLİ→"Karar Gerekli", HESAPLANAN→"Hesaplanan", each with a one-line Turkish explanation); pre-transform `[ETIKET]` → `**⟦G:ETIKET⟧**`; `react-markdown` + `remark-gfm` (new web deps, `allowedElements`-style custom component map, raw HTML disabled) rendering SeoVista-styled cards/lists/tables; `strong` renderer detects `⟦G:…⟧` → badge chip (text + color, never color-only). Header band: "CrewAgency multi-agent sistemi · üretim: {generatedAt}" + disclaimer that the report is AI-generated and labels mark confidence.
- Result pages (4): mount `<CrewReportSection sourceJobId={jobId} tool="…" />` below existing completed-content. One `<h1>` rule untouched (section uses `<h2>`).

## 4. Honesty & Standards

- AI-generated report always labeled; guardrail labels never stripped (rendered with Turkish explanation); no mock/fallback report; failure states explicit.
- Rate limit namespaced (`CREW_REPORT_PER_IP_RATE_LIMIT` default 5/day-ish per IP — follows existing helper semantics).
- Turkish UI; WCAG 2.1 AA; TS strict; TDD; Node 24; `pnpm@10.30.1`.

## 5. Testing

- client: kickoff/getJob shapes, 401/403→crew.auth, 429→crew.rate_limited, 503→crew.unavailable, timeout, missing-key constructor error, resolveCrewAgencyClient null path.
- processor: endpoint mapping per tool, context truncation, payload shape (no score).
- submission: happy + enqueue-failure compensation (mirror keyword-rank test).
- rate limiter: bucket namespacing backwards compatible.
- action: validation failures, rate-limit contract, env-missing honest error, lead creation + email update calls, source-job-not-completed rejection.
- section: locked → submit → in-flight → completed transitions (mocked actions); consent required.
- view: guardrail badges render with Turkish labels, markdown structures render through custom map, script/HTML injection neutralized (raw HTML disabled), header band present.
