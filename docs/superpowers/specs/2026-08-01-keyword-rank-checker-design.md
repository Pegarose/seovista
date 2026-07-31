# Design Spec: Keyword Rank Checker (`/tools/keyword-rank-checker/`)

**Date:** 2026-08-01
**Status:** Approved (decisions: Tier A only, locales tr-TR + en-US, SearXNG top-10)
**PRD:** `docs/prd/2026-07-31-keyword-tracking-prd.md` (Tier A)

---

## 1. Purpose

Free, anonymous, one-shot keyword rank check: domain + keyword + locale → position in top-10 SERP results + top-10 snapshot. Lead-acquisition utility following the proven tool template. **No invented score** — output is factual position data with an honest data-source label.

## 2. Data Source: SearXNG (not DataForSEO)

- Live source: self-hosted **SearXNG** JSON API (`GET {SEARXNG_BASE_URL}/search?q=…&format=json&language=…`).
- **SSRF boundary note:** `SEARXNG_BASE_URL` is operator-configured env config (typically `http://127.0.0.1:8088` in dev), NOT user input — the provider client must NOT go through the user-input SSRF guard (which would block loopback). It still enforces: http/https scheme only, 15 s timeout, 1 MiB body cap.
- When `SEARXNG_BASE_URL` is unset → **deterministic mock provider**; results labeled "Örnek veri" in the UI. Tests never touch the network.
- Locale mapping: `tr-TR` → SearXNG `language=tr-TR`; `en-US` → `language=en-US`.

## 3. Architecture (mirrors schema/ai-crawler pipeline)

```
[Form /tools/keyword-rank-checker/] → Server Action (Zod, rate limit, getAdminDb-in-try)
   → job_records (queue_name 'keyword_rank_audit', target = domain, status 'queued')
   → BullMQ queue 'keyword_rank_jobs' (env KEYWORD_RANK_QUEUE_NAME)
   → keyword-rank worker (concurrency env KEYWORD_RANK_WORKER_CONCURRENCY, default 3)
      → SerpProvider.search(keyword, locale)   [SearXNG | mock]
      → processKeywordRankPayload (pure)       [rank extraction]
   → job_results (result_type 'keyword-rank:result')
   → Polling result page (AuditPoller + job-result-guard)
```

## 4. Components

### 4.1 `@seovista/seo-core` — `serp-rank.ts` (new, pure)

- `SERP_LOCALES`: `{ "tr-TR": { searxngLanguage: "tr-TR", label: "Türkçe (Türkiye)" }, "en-US": { searxngLanguage: "en-US", label: "English (US)" } }`; type `SerpLocale`.
- `normalizeHost(input)`: strip scheme/path/query/port, lowercase, strip one leading `www.`.
- `matchesDomain(resultUrl, targetDomain)`: host equality or `host.endsWith("." + target)` (subdomains count).
- `parseSerpEntries(rawJson)`: SearXNG `{ results: [{url,title,content}] }` → `SerpEntry[]` (position 1-based, first 10 only; malformed entries skipped).
- `extractKeywordRank({ domain, entries })`: → `{ position: number|null, top10: Array<{position,url,title,snippet,isTarget}> }`.
- `isValidPublicDomain(input)`: hostname shape (labels, at least one dot, TLD alpha ≥2), no IP literals, no `localhost`/`.local`/`.internal`/`.test`.

### 4.2 Worker

- `utils/serp-provider.ts`: `SerpProvider` interface (`search(keyword, locale): Promise<SerpEntry[]>`); `SearxngProvider` (fetch, timeout 15 s, 1 MiB cap, typed `SerpProviderError` with codes `provider.timeout|provider.unavailable|provider.misconfigured`); `MockSerpProvider` (deterministic: 10 synthetic entries, target domain inserted at stable hash(domain+keyword) % 10 + 1); `resolveSerpProvider(env)` factory.
- `processors/keyword-rank.ts`: `processKeywordRankPayload({domain, keyword, locale, entries, dataSource})` → result payload (pure).
- `queue/keyword-rank-submission.ts`: mirrors schema-submission (constants `KEYWORD_RANK_QUEUE_NAME="keyword_rank_jobs"`, `KEYWORD_RANK_JOB_NAME="keyword_rank"`, `KEYWORD_RANK_JOB_RECORD_QUEUE_NAME="keyword_rank_audit"`; orphan compensation on enqueue failure).
- `queue/keyword-rank-worker.ts`: mirrors schema-worker (parseRedisUrl duplication is accepted convention; catch-path terminal-status mapping uses provider error codes).
- `worker.ts`: register `startKeywordRankWorker()` + shutdown close; `index.ts`: export submission + processor symbols.
- Payload (`result_type 'keyword-rank:result'`): `{ kind, domain, keyword, locale, position, top10, resultsReturned, checkedAt, dataSource }`.

### 4.3 Web

- `src/lib/keyword-rank-checker/validation.ts`: Zod — domain (`isValidPublicDomain`), keyword (trim, 2-120), locale enum. No "use server".
- `src/lib/keyword-rank-checker/actions.ts`: mirrors schema action (rate limit, getAdminDb-in-try, NEXT_REDIRECT rethrow, Turkish error contract).
- `app/tools/keyword-rank-checker/page.tsx`: client form page mirroring schema-checker (fields: Alan Adı, Anahtar Kelime, Arama Bölgesi select). One `<h1>`.
- `app/tools/keyword-rank-checker/result/[jobId]/page.tsx`: mirrors ai-crawler result page (UUID guard, db guard, `queue_name='keyword_rank_audit'` query, `normalizeJobResultStatus`, AuditPoller in-flight, failure view, `UnknownJobStatusView`, completed view).
- Completed view: position card (`#4` or "İlk 10'da bulunamadı"), top-10 table (target row highlighted + "Sizin siteniz" badge, not color-only), data-source label ("Veri kaynağı: SearXNG" / "Örnek veri — SearXNG yapılandırılmamış"), `checkedAt` snapshot note, CTA to `/tools/geo-readiness-checker/`.

### 4.4 Index & copy

- `app/tools/page.tsx`: 5th Preview instrument "Keyword Rank Checker" (href `/tools/keyword-rank-checker/`); hero capability "Four previews available" → "Five previews available".
- `src/content/site.ts` toolsPage: meta description + body name Keyword Rank Checker as fifth linked preview; `apps/web/tests/e2e/seo.spec.ts` pin updated to the exact new string.

### 4.5 Optional dev infrastructure

- `docker-compose.yml`: `searxng` service (`searxng/searxng:latest`, loopback-only `${SEOVISTA_SEARXNG_PORT:-8088}:8080`, `./fixtures/searxng:/etc/searxng:ro`, ownership labels per repo convention). Port 8088 is outside all off-limits ranges.
- `fixtures/searxng/settings.yml`: `search.formats: [html, json]` (JSON API is off by default upstream).
- `.env.example`: `SEARXNG_BASE_URL=`, `KEYWORD_RANK_QUEUE_NAME=`, `KEYWORD_RANK_WORKER_CONCURRENCY=`.

## 5. Honesty & Standards

- No score; position data labeled with its source and check time; mock data explicitly marked.
- Turkish UI (PRD §0.3); WCAG 2.1 AA (target row = text badge + background, not color-only); one `<h1>` in one `<main>`.
- TS strict; TDD; Node 24 LTS; `pnpm@10.30.1`.

## 6. Testing

- seo-core: host normalization, domain matching (www/subdomain/case), entry parsing (malformed skips, 10-cap), rank extraction (found/absent), locale map, domain validator.
- worker: processor purity; submission happy + enqueue-failure compensation; provider (mock determinism; SearXNG params/timeout/cap/error mapping with mocked fetch).
- web: action validation errors, rate-limit contract, 503 contract (DATABASE_URL unset), NEXT_REDIRECT rethrow; result page (completed renders position + top-10 + source label; unknown status → guard view).
