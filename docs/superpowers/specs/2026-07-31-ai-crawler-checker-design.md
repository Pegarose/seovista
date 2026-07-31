# Design Spec: AI Crawler Checker (`/tools/ai-crawler-checker/`)

**Date:** 2026-07-31
**Status:** Approved (design presented and confirmed by user)
**Owner:** SeoVista Engineering Team

---

## 1. Purpose

Free tool per PRD MVP 2: URL/domain input → access status for major search and AI crawler directives, conflicting rules, and recommended fixes. No email required for basic output.

## 2. Architecture

Mirrors the proven Schema Checker pipeline:

```
[ Form (URL) ] → [ Server Action: validate + SSRF guard ]
      → [ submitAiCrawlerAudit: job_records (queue_name 'ai_crawler_audit') + BullMQ enqueue ('ai_crawler_audit_jobs') ]
      → [ redirect /tools/ai-crawler-checker/result/[jobId] ]
      → [ Worker: fetch robots.txt via hardened fetcher.ts → parse + evaluate → job_results → status transitions ]
      → [ Result page: polling → access matrix, conflicts, recommendations, Crew CTA ]
```

## 3. Components

### 3.1 `@seovista/seo-core` — robots domain logic (PRD §321: robots/sitemap logic lives in seo-core)

- **`robots.ts`** — RFC 9309 parser and evaluator:
  - `parseRobotsTxt(content): RobotsTxtDocument` — groups (user-agents + Allow/Disallow rules with line numbers), sitemap directives, parse errors. Comments (`#`), blank lines, empty `Disallow:` (= allow) handled.
  - `isPathAllowed(doc, userAgent, path): boolean` — most-specific group selection (longest UA token prefix match, case-insensitive; `*` fallback; same-token groups merged), longest-pattern match, Allow wins ties, `*`/`$` pattern support.
  - `evaluateCrawlerAccess(doc, userAgent): 'allowed' | 'blocked' | 'partial'` — `blocked` if `/` disallowed; `partial` if `/` allowed but group has non-empty Disallow rules; else `allowed`.
  - `detectRuleConflicts(doc): RuleConflict[]` — same pattern as both Allow and Disallow in one group; UA-specific full block while `*` group allows (informational).
- **`ai-crawlers.ts`** — curated registry (`AI_CRAWLER_REGISTRY`) grouped by category:
  - `ai-training`: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Bytespider, Amazonbot, Meta-ExternalAgent
  - `ai-search`: OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot, Perplexity-User
  - `search`: Googlebot, Bingbot, Applebot, DuckDuckBot

### 3.2 Worker (`apps/worker`)

- `queue/ai-crawler-submission.ts` — `submitAiCrawlerAudit({ url })`: real `job_records` contract (id, job_identity, queue_name, correlation_id, target, status='queued') + BullMQ enqueue. Mirrors `schema-submission.ts`.
- `queue/ai-crawler-worker.ts` — `startAiCrawlerWorker`: fetches `<origin>/robots.txt` through `utils/fetcher.ts` SSRF defenses (reuse its safe-fetch primitive; if only HTML parsing export exists, add a minimal `fetchTextSafely` that reuses the same DNS/IP validation), runs processor, writes `job_results` (result_type `'ai-crawler:result'`), transitions queued→running→completed/failed. Registered and shut down in `worker.ts` beside `startSchemaWorker`.
- `processors/ai-crawler-audit.ts` — pure function `processAiCrawlerAuditPayload(robotsTxtContent: string | null, found: boolean): AiCrawlerAuditResultPayload`.

### 3.3 Payload contract

```ts
interface AiCrawlerAuditResultPayload {
  score: number;                 // 0-100
  robotsTxtFound: boolean;
  robotsTxtUrl: string;
  sitemaps: string[];
  crawlers: Array<{
    userAgent: string; label: string;
    category: 'ai-training' | 'ai-search' | 'search';
    status: 'allowed' | 'blocked' | 'partial';
  }>;
  conflicts: Array<{ description: string; lines: string[] }>;
  recommendations: string[];     // Turkish
  parseErrors: string[];
}
```

### 3.4 Web (`apps/web`)

- `src/lib/url-safety.ts` (new, shared) — hardened http/https-only + full private/metadata/loopback range guard, moved out of schema-checker; schema-checker updated to import it (single source of truth).
- `src/lib/ai-crawler-checker/validation.ts` — Zod schema using the shared guard (no `"use server"`).
- `src/lib/ai-crawler-checker/actions.ts` — `"use server"`, async-only exports: `startAiCrawlerAuditAction`.
- `src/lib/score-band.ts` (new, shared) — `getSchemaScoreBand` moved here; schema-checker updated to import it.
- `app/tools/ai-crawler-checker/page.tsx` — form (one `<h1>` in one `<main>`).
- `app/tools/ai-crawler-checker/result/[jobId]/page.tsx` — job_records LEFT JOIN job_results on correlation_id, queue_name filter, polling, failure states.
- Components: `crawler-access-matrix.tsx` (grouped table, text+icon badges, no color-only), `crawler-issues.tsx` (conflicts + recommendations). Reuses `AuditPoller`, `CrewCtaView`, shared score-band.
- `app/tools/page.tsx` — instrument index gains Schema Checker + AI Crawler Checker entries.

## 4. Scoring & honesty rules

- Start 100. Blocked `ai-search`/`search` bot: −12 each. Conflict: −8 each (cap −24). Missing robots.txt: cap 60 + informational note (missing = allow-all per spec, not an error).
- Blocked `ai-training` bots carry **no penalty** — blocking training crawlers is a legitimate policy choice; rendered as neutral info, never as a defect (PRD honesty rules; no fabricated urgency).
- robots.txt unreachable/HTTP error → job `failed` with honest message; no invented data.

## 5. UI & validation standards

- Turkish UI strings (PRD §0.3), WCAG 2.1 AA, one `<h1>` in one `<main>`, text+icon status indicators.
- TypeScript strict, Node 24 LTS, `pnpm@10.30.1`.
- TDD per task; unit tests for parser (groups, wildcards, `$`, longest-match, Allow-tie, empty disallow, comments), registry evaluation, conflicts, SSRF guard, worker processor, and web components.
