# Keyword Rank Checker (`/tools/keyword-rank-checker/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tier A Keyword Rank Checker: domain + keyword + locale (tr-TR/en-US) → one-shot SearXNG top-10 position check via the proven pipeline (Server Action → job_records → BullMQ → worker → job_results → polling result page). Deterministic mock provider when `SEARXNG_BASE_URL` is unset. No invented score; data-source label mandatory.

**Architecture:** Pure rank logic in `packages/seo-core/src/serp-preview.ts`'s sibling `serp-rank.ts`. Worker: `utils/serp-provider.ts` (interface + SearXNG client + mock), `processors/keyword-rank.ts`, `queue/keyword-rank-submission.ts`, `queue/keyword-rank-worker.ts`, registered in `worker.ts`, exported from `index.ts`. Web: `src/lib/keyword-rank-checker/{validation,actions}.ts`, form page, result page, tools index + copy. Reference implementations to mirror: schema-checker (action, form page), ai-crawler-checker (result page), schema-submission/schema-worker (queue chain).

**Tech Stack:** Next.js App Router, React 19, BullMQ, pg, Zod, Vitest + Testing Library.

## Global Constraints

- Node 24 LTS at `C:\Users\BCX\.config\herd\bin\nvm\v24.12.0` on PATH; `corepack pnpm@10.30.1`.
- TypeScript strict; TDD (test first, verify red, implement, verify green).
- Turkish UI strings; exactly one `<h1>` in one `<main>`; WCAG 2.1 AA (no color-only status).
- No score anywhere in the payload or UI; `dataSource` label mandatory.
- SearXNG client: NOT through the user-input SSRF guard (operator-configured endpoint; http/https only, 15 s timeout, 1 MiB body cap, typed errors).
- Do NOT touch unrelated working-tree changes; commit only your task's files with explicit paths.
- Queue contract: BullMQ queue `keyword_rank_jobs` (env `KEYWORD_RANK_QUEUE_NAME`), job name `keyword_rank`, job_records `queue_name='keyword_rank_audit'`, result_type `'keyword-rank:result'`, concurrency env `KEYWORD_RANK_WORKER_CONCURRENCY` default 3.

---

### Task 1: Rank extraction logic in `@seovista/seo-core`

**Files:**
- Create: `packages/seo-core/src/serp-rank.ts`
- Modify: `packages/seo-core/src/index.ts` (barrel re-export, `.js` extension style)
- Test: `packages/seo-core/src/__tests__/serp-rank.test.ts`

**Interfaces:**
- Produces: `SERP_LOCALES`, `SerpLocale`, `SerpEntry`, `KeywordRankResult`, `normalizeHost`, `matchesDomain`, `parseSerpEntries`, `extractKeywordRank`, `isValidPublicDomain`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  extractKeywordRank,
  isValidPublicDomain,
  matchesDomain,
  normalizeHost,
  parseSerpEntries,
  SERP_LOCALES,
} from "../serp-rank";

describe("normalizeHost", () => {
  it("strips scheme, path, port and www", () => {
    expect(normalizeHost("https://www.Example.COM:443/sayfa?q=1")).toBe("example.com");
  });
  it("accepts a bare host", () => {
    expect(normalizeHost("Example.com")).toBe("example.com");
  });
});

describe("matchesDomain", () => {
  it("matches exact host and subdomains, rejects lookalikes", () => {
    expect(matchesDomain("https://example.com/a", "example.com")).toBe(true);
    expect(matchesDomain("https://blog.example.com/", "example.com")).toBe(true);
    expect(matchesDomain("https://www.example.com", "example.com")).toBe(true);
    expect(matchesDomain("https://notexample.com/", "example.com")).toBe(false);
    expect(matchesDomain("https://example.com.evil.com/", "example.com")).toBe(false);
  });
});

describe("parseSerpEntries", () => {
  it("maps SearXNG results to 1-based entries capped at 10", () => {
    const raw = { results: Array.from({ length: 12 }, (_, i) => ({ url: `https://r${i}.com`, title: `T${i}`, content: `C${i}` })) };
    const entries = parseSerpEntries(raw);
    expect(entries).toHaveLength(10);
    expect(entries[0]).toMatchObject({ position: 1, url: "https://r0.com", title: "T0", snippet: "C0" });
    expect(entries[9]?.position).toBe(10);
  });
  it("skips malformed entries without dropping valid ones", () => {
    const raw = { results: [{ url: "https://ok.com", title: "Ok", content: "c" }, { title: "no url" }, null, { url: "https://ok2.com", title: "Ok2", content: "" }] };
    const entries = parseSerpEntries(raw);
    expect(entries.map((e) => e.url)).toEqual(["https://ok.com", "https://ok2.com"]);
    expect(entries[1]?.position).toBe(2); // positions re-sequenced after skip
  });
  it("returns [] for non-object input", () => {
    expect(parseSerpEntries(null)).toEqual([]);
    expect(parseSerpEntries({ results: "nope" })).toEqual([]);
  });
});

describe("extractKeywordRank", () => {
  const entries = parseSerpEntries({
    results: [
      { url: "https://rival.com/x", title: "R", content: "r" },
      { url: "https://www.example.com/page", title: "M", content: "m" },
    ],
  });
  it("finds the target position and flags the target row", () => {
    const result = extractKeywordRank({ domain: "example.com", entries });
    expect(result.position).toBe(2);
    expect(result.top10).toHaveLength(2);
    expect(result.top10[1]?.isTarget).toBe(true);
    expect(result.top10[0]?.isTarget).toBe(false);
  });
  it("returns null position when absent", () => {
    expect(extractKeywordRank({ domain: "absent.com", entries }).position).toBeNull();
  });
});

describe("SERP_LOCALES", () => {
  it("exposes tr-TR and en-US with SearXNG language codes", () => {
    expect(SERP_LOCALES["tr-TR"].searxngLanguage).toBe("tr-TR");
    expect(SERP_LOCALES["en-US"].searxngLanguage).toBe("en-US");
  });
});

describe("isValidPublicDomain", () => {
  it("accepts normal domains", () => {
    expect(isValidPublicDomain("example.com")).toBe(true);
    expect(isValidPublicDomain("blog.example.co.uk")).toBe(true);
  });
  it("rejects IPs, localhost, internal TLDs, missing dot", () => {
    expect(isValidPublicDomain("127.0.0.1")).toBe(false);
    expect(isValidPublicDomain("localhost")).toBe(false);
    expect(isValidPublicDomain("app.internal")).toBe(false);
    expect(isValidPublicDomain("nodot")).toBe(false);
    expect(isValidPublicDomain("bad domain.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/seo-core test`
Expected: FAIL — `../serp-rank` not found.

- [ ] **Step 3: Implement `packages/seo-core/src/serp-rank.ts`**

```ts
/** Keyword rank extraction — pure SERP parsing/matching. No network, no score. */
export interface SerpEntry {
  readonly position: number; // 1-based
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
}

export const SERP_LOCALES = {
  "tr-TR": { searxngLanguage: "tr-TR", label: "Türkçe (Türkiye)" },
  "en-US": { searxngLanguage: "en-US", label: "English (US)" },
} as const;
export type SerpLocale = keyof typeof SERP_LOCALES;

export function normalizeHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (!host.includes("://")) host = `https://${host}`;
  try {
    host = new URL(host).hostname;
  } catch {
    host = input.trim().toLowerCase().split("/")[0] ?? "";
  }
  return host.replace(/^www\./, "");
}

export function matchesDomain(resultUrl: string, targetDomain: string): boolean {
  const host = normalizeHost(resultUrl);
  const target = normalizeHost(targetDomain);
  return host === target || host.endsWith(`.${target}`);
}

export function parseSerpEntries(raw: unknown): SerpEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const entries: SerpEntry[] = [];
  for (const item of results) {
    if (entries.length >= 10) break;
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string" || !url) continue;
    const title = (item as { title?: unknown }).title;
    const content = (item as { content?: unknown }).content;
    entries.push({
      position: entries.length + 1,
      url,
      title: typeof title === "string" ? title : "",
      snippet: typeof content === "string" ? content : "",
    });
  }
  return entries;
}

export interface KeywordRankResult {
  readonly position: number | null;
  readonly top10: ReadonlyArray<SerpEntry & { readonly isTarget: boolean }>;
}

export function extractKeywordRank(input: { domain: string; entries: SerpEntry[] }): KeywordRankResult {
  const top10 = input.entries.map((e) => ({ ...e, isTarget: matchesDomain(e.url, input.domain) }));
  const hit = top10.find((e) => e.isTarget);
  return { position: hit ? hit.position : null, top10 };
}

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const BLOCKED_TLDS = new Set(["local", "internal", "test", "localhost", "invalid"]);

export function isValidPublicDomain(input: string): boolean {
  const host = normalizeHost(input);
  if (!host || host.length > 253 || !host.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false; // IP literals
  if (!HOSTNAME_RE.test(host)) return false;
  const tld = host.split(".").pop() ?? "";
  return /^[a-z]{2,}$/.test(tld) && !BLOCKED_TLDS.has(tld);
}
```

Re-export from `packages/seo-core/src/index.ts` (type + value blocks, `./serp-rank.js`).

- [ ] **Step 4: Run test to verify it passes** — `corepack pnpm@10.30.1 --filter @seovista/seo-core test` (all pass) + `--filter @seovista/seo-core typecheck` (0 errors).
- [ ] **Step 5: Commit** — `git add packages/seo-core` → `feat(seo-core): add keyword rank extraction and SERP locale module`

---

### Task 2: Worker — provider, processor, queue chain, registration

**Files:**
- Create: `apps/worker/src/utils/serp-provider.ts`
- Create: `apps/worker/src/processors/keyword-rank.ts`
- Create: `apps/worker/src/queue/keyword-rank-submission.ts`
- Create: `apps/worker/src/queue/keyword-rank-worker.ts`
- Modify: `apps/worker/src/worker.ts` (register `startKeywordRankWorker()` alongside ai-crawler; close on shutdown; extend `RunningWorker`)
- Modify: `apps/worker/src/index.ts` (export submission + processor symbols, existing style)
- Modify: `.env.example` (add `SEARXNG_BASE_URL=`, `KEYWORD_RANK_QUEUE_NAME=`, `KEYWORD_RANK_WORKER_CONCURRENCY=` to the queue section)
- Tests: `apps/worker/src/__tests__/keyword-rank-processor.test.ts`, `keyword-rank-submission.test.ts`, `serp-provider.test.ts`

**Interfaces:**
- Consumes: `parseSerpEntries`, `extractKeywordRank`, `SERP_LOCALES`, `SerpEntry`, `SerpLocale` (Task 1 — add `@seovista/seo-core` to apps/worker package.json if absent).
- Produces: `SerpProvider`, `SearxngProvider`, `MockSerpProvider`, `SerpProviderError`, `resolveSerpProvider(env)`, `processKeywordRankPayload`, `submitKeywordRankCheck` (+ close/reset fns), `KEYWORD_RANK_QUEUE_NAME`, `KEYWORD_RANK_JOB_NAME`, `KEYWORD_RANK_JOB_RECORD_QUEUE_NAME`, `startKeywordRankWorker`, `getKeywordRankWorkerConcurrency`.

- [ ] **Step 1: Write failing tests**

`keyword-rank-processor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { processKeywordRankPayload } from "../processors/keyword-rank";
import { parseSerpEntries } from "@seovista/seo-core";

describe("processKeywordRankPayload", () => {
  const entries = parseSerpEntries({
    results: [
      { url: "https://rival.com/a", title: "Rival", content: "r" },
      { url: "https://example.com/b", title: "Mine", content: "m" },
    ],
  });
  it("builds the persisted payload without a score", () => {
    const payload = processKeywordRankPayload({
      domain: "example.com", keyword: "seo denetimi", locale: "tr-TR",
      entries, dataSource: "mock",
    });
    expect(payload.kind).toBe("keyword-rank");
    expect(payload.position).toBe(2);
    expect(payload.top10).toHaveLength(2);
    expect(payload.resultsReturned).toBe(2);
    expect(payload.dataSource).toBe("mock");
    expect(typeof payload.checkedAt).toBe("string");
    expect(payload).not.toHaveProperty("score");
  });
});
```

`keyword-rank-submission.test.ts` — mirror `schema-submission.test.ts` conventions (`vi.hoisted` + `vi.mock("bullmq")`): happy path returns jobId + INSERT uses `queue_name 'keyword_rank_audit'` + job data `{ jobId, domain, keyword, locale }`; enqueue rejection → DELETE compensation with same id + same error rethrown.

`serp-provider.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { MockSerpProvider, resolveSerpProvider, SearxngProvider, SerpProviderError } from "../utils/serp-provider";

describe("MockSerpProvider", () => {
  it("is deterministic and always contains the target domain exactly once in top 10", async () => {
    const provider = new MockSerpProvider();
    const a = await provider.search("seo denetimi", "tr-TR", "example.com");
    const b = await provider.search("seo denetimi", "tr-TR", "example.com");
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(a.filter((e) => e.url.includes("example.com"))).toHaveLength(1);
    expect(a.every((e) => e.position >= 1 && e.position <= 10)).toBe(true);
  });
});

describe("SearxngProvider", () => {
  it("builds the JSON search URL with language and returns parsed entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      body: null, // triggers text() fallback
      text: async () => JSON.stringify({ results: [{ url: "https://a.com", title: "A", content: "c" }] }),
    });
    const provider = new SearxngProvider({ baseUrl: "http://127.0.0.1:8088", fetchImpl: fetchMock as never });
    const entries = await provider.search("test keyword", "tr-TR");
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("format")).toBe("json");
    expect(calledUrl.searchParams.get("language")).toBe("tr-TR");
    expect(entries[0]).toMatchObject({ position: 1, url: "https://a.com" });
  });
  it("maps non-OK responses to provider.unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, body: null, text: async () => "" });
    const provider = new SearxngProvider({ baseUrl: "http://127.0.0.1:8088", fetchImpl: fetchMock as never });
    await expect(provider.search("x", "en-US")).rejects.toMatchObject({ code: "provider.unavailable" });
  });
  it("rejects non-http base URLs as misconfigured", () => {
    expect(() => new SearxngProvider({ baseUrl: "ftp://x" })).toThrowError(SerpProviderError);
  });
});

describe("resolveSerpProvider", () => {
  it("returns mock when SEARXNG_BASE_URL is unset, searxng when set", () => {
    expect(resolveSerpProvider({}).source).toBe("mock");
    expect(resolveSerpProvider({ SEARXNG_BASE_URL: "http://127.0.0.1:8088" }).source).toBe("searxng");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `corepack pnpm@10.30.1 --filter @seovista/worker test` (module not found).

- [ ] **Step 3: Implement**

`apps/worker/src/utils/serp-provider.ts`:
- `SerpProviderError extends Error` with `code: "provider.timeout" | "provider.unavailable" | "provider.misconfigured"`, `retryable` flag (timeout/unavailable → true).
- `interface SerpProvider { readonly source: "searxng" | "mock"; search(keyword: string, locale: SerpLocale, domain?: string): Promise<SerpEntry[]>; }`
- `SearxngProvider({ baseUrl, fetchImpl?, timeoutMs? })`: constructor validates http/https (else `provider.misconfigured`); `search` builds `/search?q=…&format=json&language=<SERP_LOCALES[locale].searxngLanguage>`, `AbortSignal.timeout(timeoutMs ?? 15000)`, `Accept: application/json`; non-OK → `provider.unavailable`; abort/timeout → `provider.timeout`; body read with 1 MiB cap (reader loop with text() fallback for plain mocks, mirroring `fetchWithValidatedRedirects`); JSON parse failure → `provider.unavailable`; returns `parseSerpEntries(parsed)`.
- `MockSerpProvider`: deterministic — 10 synthetic entries from a fixed pool of 9 placeholder hosts (`rakip-ornek-N.com` style, clearly synthetic) + the target domain inserted at `stableHash(domain+keyword) % 10 + 1` (simple FNV-1a or djb2; positions re-sequenced 1-10). If `domain` undefined (shouldn't happen in production), insert `ornek-hedef.com`.
- `resolveSerpProvider(env = process.env)`: `env.SEARXNG_BASE_URL` set → `SearxngProvider`, else `MockSerpProvider`.

`apps/worker/src/processors/keyword-rank.ts`:
```ts
export interface KeywordRankResultPayload {
  kind: "keyword-rank";
  domain: string; keyword: string; locale: SerpLocale;
  position: number | null;
  top10: ReadonlyArray<SerpEntry & { isTarget: boolean }>;
  resultsReturned: number;
  checkedAt: string;
  dataSource: "searxng" | "mock";
}
```
`processKeywordRankPayload({domain, keyword, locale, entries, dataSource})` → `{ kind:"keyword-rank", ...extractKeywordRank({domain, entries}), resultsReturned: entries.length, checkedAt: new Date().toISOString(), ... }`.

`apps/worker/src/queue/keyword-rank-submission.ts`: mirror `schema-submission.ts` exactly (constants, singleton queue producer, close/reset fns, INSERT with `queue_name 'keyword_rank_audit'` and `target = domain`, `queue.add(KEYWORD_RANK_JOB_NAME, { jobId, domain, keyword, locale }, { jobId })`, orphan DELETE compensation + `orphan_compensation_failed` structured log, outbox comment).

`apps/worker/src/queue/keyword-rank-worker.ts`: mirror `schema-worker.ts` (parseRedisUrl copy, concurrency getter with `KEYWORD_RANK_WORKER_CONCURRENCY`, queue resolution `options.queueName ?? env.KEYWORD_RANK_QUEUE_NAME ?? KEYWORD_RANK_QUEUE_NAME`). Job handler: `running` UPDATE → `resolveSerpProvider()` → `provider.search(keyword, locale, domain)` → `processKeywordRankPayload({..., dataSource: provider.source})` → INSERT job_results (`result_type 'keyword-rank:result'`, via correlation_id/job_identity lookup with `KEYWORD_RANK_JOB_RECORD_QUEUE_NAME` filter) → `completed` UPDATE. Catch: provider error codes map `provider.timeout/unavailable` → `'timeout'`, `provider.misconfigured` → `'permanent'`; keep the schema-worker's generic fallback heuristics.

`apps/worker/src/worker.ts`: import + `startKeywordRankWorker()` next to ai-crawler; add `keywordRankWorker: Worker` to `RunningWorker`; close it FIRST in shutdown (same order pattern as aiCrawlerWorker).

`apps/worker/src/index.ts`: export `submitKeywordRankCheck, closeKeywordRankSubmissionQueue, KEYWORD_RANK_QUEUE_NAME, KEYWORD_RANK_JOB_NAME, KEYWORD_RANK_JOB_RECORD_QUEUE_NAME` + types, `processKeywordRankPayload` + `KeywordRankResultPayload` type (existing style).

`.env.example`: append to the queue section: `SEARXNG_BASE_URL=`, `KEYWORD_RANK_QUEUE_NAME=`, `KEYWORD_RANK_WORKER_CONCURRENCY=` with a comment that unset SEARXNG_BASE_URL uses the deterministic mock.

- [ ] **Step 4: Verify** — worker tests all pass (lifecycle context: `SEOVISTA_LIFECYCLE_CONTEXT_PATH=C:\bc-proje\Seovista\.lifecycle-evidence\seovista-run-fb867d236f9d-context.json` if the dev stack is running; the three known environmental failures are acceptable: geo-worker 429 DNS wildcard), workspace `typecheck` 0, worker `lint` 0 errors (no new warnings).
- [ ] **Step 5: Commit** — explicit paths → `feat(worker): add keyword rank queue chain with SearXNG provider and mock`

---

### Task 3: Web — validation, action, form page

**Files:**
- Create: `apps/web/src/lib/keyword-rank-checker/validation.ts`
- Create: `apps/web/src/lib/keyword-rank-checker/actions.ts`
- Create: `apps/web/app/tools/keyword-rank-checker/page.tsx`
- Modify: `apps/web/package.json` — add `@seovista/seo-core` dep if absent (likely present already)
- Tests: `apps/web/src/lib/keyword-rank-checker/__tests__/actions.test.ts` (+ validation tests in same file or separate)

**Interfaces:**
- Consumes: `isValidPublicDomain`, `SERP_LOCALES` (seo-core); `submitKeywordRankCheck`, `checkIpRateLimit` (@seovista/worker, Task 2); `extractClientIp` (../geo-checker/ip).
- Produces: `validateKeywordRankInput`, `startKeywordRankCheckAction`, `KeywordRankActionState`.

- [ ] **Step 1: Write failing tests** — mirror `apps/web/src/lib/schema-checker/__tests__/actions.test.ts` conventions (mock `@seovista/worker`, `next/headers`, `next/navigation`):
  - invalid domain ("127.0.0.1", "nodot") → `status:"error"` with `errors.domain` set
  - invalid keyword ("", 121 chars) → `errors.keyword`
  - invalid locale ("de-DE") → `errors.locale`
  - rate limit exceeded → form error with "Saatlik audit limitine (10)"
  - happy path → submit called with `{ domain, keyword, locale }` and redirect to `/tools/keyword-rank-checker/result/<jobId>` (NEXT_REDIRECT digest rethrown)
  - DATABASE_URL unset → system-error contract (`status:"error"`, form "Sistem hatası nedeniyle denetim başlatılamadı…") NOT a throw
- [ ] **Step 2: Verify red** — `corepack pnpm@10.30.1 --filter @seovista/web test src/lib/keyword-rank-checker`.
- [ ] **Step 3: Implement**
  - `validation.ts` (NO "use server"): `KeywordRankInputSchema = z.object({ domain: z.string().trim().min(3,"Alan adı giriniz.").max(253).refine(isValidPublicDomain,{message:"Geçerli bir alan adı giriniz (örn. example.com)."}), keyword: z.string().trim().min(2,"Anahtar kelime giriniz.").max(120,"Anahtar kelime en fazla 120 karakter olabilir."), locale: z.enum(["tr-TR","en-US"],{ message:"Geçerli bir bölge seçiniz." }) })`; `validateKeywordRankInput({domain, keyword, locale})`.
  - `actions.ts`: mirror schema action structure EXACTLY (getAdminDb-in-try comment, REDIS_URL guard, headers/extractClientIp, `AUDIT_PER_IP_RATE_LIMIT` default 10, Turkish rate-limit + system-error strings, NEXT_REDIRECT digest rethrow, redirect to `/tools/keyword-rank-checker/result/${result.jobId}`). Action state: `{ status: "idle"|"error"; errors?: { domain?: string[]; keyword?: string[]; locale?: string[]; form?: string[] } }`. Note: schema action's state includes `"validating"` in the union — do NOT copy it (known debt M3; unused).
  - `page.tsx`: mirror schema-checker form page (client component, `useActionState`); h1 "Anahtar Kelime Sıralama Kontrolü"; subtext mentions SearXNG top-10 and honest snapshot; fields: `Alan Adı` (text, placeholder "example.com"), `Anahtar Kelime` (text), `Arama Bölgesi` (`<select name="locale">` with tr-TR/en-US from SERP_LOCALES labels); submit "Sıralamayı Kontrol Et" / pending "Kontrol Ediliyor...". One `<main>`, one `<h1>`.
- [ ] **Step 4: Verify green** — target suite + full `@seovista/web test` (all pass), `typecheck` 0, `lint` 0.
- [ ] **Step 5: Commit** — explicit paths → `feat(web): add keyword rank checker form and server action`

---

### Task 4: Result page, tools index/copy, dev infra

**Files:**
- Create: `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx`
- Modify: `apps/web/app/tools/page.tsx` (5th Preview instrument id after SERP Preview; "Four previews available" → "Five previews available"; Schema Truth Check keeps its renumbered id)
- Modify: `apps/web/src/content/site.ts` (toolsPage meta description: "…The GEO Readiness Checker, Schema Checker, AI Crawler Checker, SERP Preview, and Keyword Rank Checker are linked as previews."; body likewise)
- Modify: `apps/web/tests/e2e/seo.spec.ts` (pinned meta description assertion → exact new string)
- Modify: `docker-compose.yml` (optional `searxng` service, loopback `${SEOVISTA_SEARXNG_PORT:-8088}:8080`, image `searxng/searxng:latest`, `./fixtures/searxng:/etc/searxng:ro`, ownership labels per existing services)
- Create: `fixtures/searxng/settings.yml` (`use_default_settings: true`, `server: { secret_key: "dev-only-not-secret", bind_address: "0.0.0.0" }`, `search: { formats: [html, json] }`)
- Test: `apps/web/src/__tests__/keyword-rank-result-states.test.ts`

**Interfaces:**
- Consumes: payload type from Task 2 (`KeywordRankResultPayload`), `normalizeJobResultStatus`/`UnknownJobStatusView` (admin/job-result-guard), `AuditPoller`, `isAuditInFlightStatus`.

- [ ] **Step 1: Write failing tests** — mirror `apps/web/src/__tests__/schema-result-states.test.ts`:
  - completed payload with position 3 → renders "#3" position card, 10-row top-10 table, target row with "Sizin siteniz" text badge, dataSource "mock" → "Örnek veri" label
  - position null → "İlk 10'da bulunamadı" state
  - unknown status → explicit guard view, no crash
  - one `<h1>` in one `<main>` on the completed view
- [ ] **Step 2: Verify red.**
- [ ] **Step 3: Implement**
  - Result page: mirror `apps/web/app/tools/ai-crawler-checker/result/[jobId]/page.tsx` structure EXACTLY (UUID_RE guard, getAdminDb guard, query with `queue_name='keyword_rank_audit'`, `normalizeJobResultStatus`, in-flight → AuditPoller with Turkish status headings ("Sıralama Kontrolü Sırada/Çalışıyor..."), failure view, `UnknownJobStatusView`, payload parse + "Sonuç Verisi Kullanılamıyor" guard, `noindex` metadata, `force-dynamic`). Completed view sections: h1 "Sıralama Kontrol Sonucu" + target line (domain, keyword, locale label); position card (big `#N` or "İlk 10'da yok"); data-source banner: `dataSource === "mock"` → amber "Örnek veri — SearXNG yapılandırılmamış; sonuçlar deterministik örnek veridir." / `searxng` → neutral "Veri kaynağı: SearXNG · Kontrol zamanı: {checkedAt}"; top-10 table (`Sıra`, `Başlık`, `URL` — target row: amber background + `<span class="font-semibold">Sizin siteniz</span>` text badge, not color-only; URLs `break-all`, plain text); CTA link card to `/tools/geo-readiness-checker/` ("GEO Hazırlık Denetimi ile sitenizi AI aramaya hazırlayın →").
  - Tools index + site.ts + seo.spec.ts: five-preview story (READ site.ts and seo.spec.ts first; pin must match EXACTLY).
  - docker-compose + settings.yml as specced (optional service; cannot be verified locally — Docker CLI is policy-blocked; note in report).
- [ ] **Step 4: Verify** — full `@seovista/web test` (all pass), `typecheck` 0, `lint` 0.
- [ ] **Step 5: Commit** — explicit paths → `feat(web): add keyword rank result page, tools index entry, and searxng dev service`
