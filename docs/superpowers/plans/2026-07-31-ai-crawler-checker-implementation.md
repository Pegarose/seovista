# AI Crawler Checker (`/tools/ai-crawler-checker/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI Crawler Checker free tool: URL input → robots.txt fetch/parse → per-bot (AI training, AI search, traditional search) access matrix, conflicting-rule detection, Turkish recommendations, background worker pipeline identical in shape to the Schema Checker.

**Architecture:** Server action validates input (shared SSRF guard) → `submitAiCrawlerAudit` inserts `job_records` (queue_name `'ai_crawler_audit'`) and enqueues on BullMQ `'ai_crawler_audit_jobs'` → worker fetches `<origin>/robots.txt` via hardened `fetcher.ts`, runs the pure processor (`@seovista/seo-core` robots parser + crawler registry), writes `job_results` (result_type `'ai-crawler:result'`), transitions status → result page polls and renders access matrix + conflicts + Crew CTA.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, Zod, PostgreSQL (`pg`), BullMQ, Vitest.

## Global Constraints

- Node 24 LTS & `pnpm@10.30.1` via Corepack; Node path `C:\Users\BCX\.config\herd\bin\nvm\v24.12.0` on PATH.
- TypeScript strict mode (`strictNullChecks` on); no untyped business logic.
- Server Components by default; `"use server"` files export only async functions and types.
- Exactly one `<h1>` inside exactly one `<main>` per page; WCAG 2.1 AA; no color-only status indicators.
- Turkish UI strings per PRD §0.3.
- Blocking `ai-training` bots is never presented as a defect (legitimate policy choice, PRD honesty rules).
- All URL fetching goes through `apps/worker/src/utils/fetcher.ts` SSRF defenses; never raw fetch.
- Mirror the existing Schema Checker plumbing files exactly (`apps/worker/src/queue/schema-submission.ts`, `schema-worker.ts`, result page) — read them before writing equivalents.

---

### Task 1: Robots.txt parser + crawler registry in `@seovista/seo-core`

**Files:**
- Create: `packages/seo-core/src/robots.ts`
- Create: `packages/seo-core/src/ai-crawlers.ts`
- Modify: `packages/seo-core/src/index.ts` (add re-exports)
- Test: `packages/seo-core/src/__tests__/robots.test.ts`

**Interfaces:**
- Produces: `parseRobotsTxt`, `isPathAllowed`, `evaluateCrawlerAccess`, `detectRuleConflicts`, `AI_CRAWLER_REGISTRY`, `evaluateAllCrawlers`, types `RobotsTxtDocument`, `CrawlerDescriptor`, `CrawlerAccessStatus`, `RuleConflict`.

- [ ] **Step 1: Write the failing test**

Create `packages/seo-core/src/__tests__/robots.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  detectRuleConflicts,
  evaluateCrawlerAccess,
  isPathAllowed,
  parseRobotsTxt,
} from "../robots";

const SAMPLE = `
# comment line
User-agent: *
Disallow: /admin
Allow: /admin/public
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
Disallow: /
`;

describe("parseRobotsTxt", () => {
  it("parses groups, rules and sitemaps, skipping comments", () => {
    const doc = parseRobotsTxt(SAMPLE);
    expect(doc.groups).toHaveLength(2);
    expect(doc.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(doc.parseErrors).toHaveLength(0);
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
  });

  it("treats empty Disallow as allow (skips the rule)", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\n");
    expect(doc.groups[0]?.rules).toHaveLength(0);
  });
});

describe("isPathAllowed", () => {
  const doc = parseRobotsTxt(SAMPLE);
  it("honours longest-match and allow-tie semantics", () => {
    expect(isPathAllowed(doc, "Googlebot", "/admin")).toBe(false);
    expect(isPathAllowed(doc, "Googlebot", "/admin/public")).toBe(true);
    expect(isPathAllowed(doc, "Googlebot", "/page")).toBe(true);
  });
  it("applies the most specific user-agent group", () => {
    expect(isPathAllowed(doc, "GPTBot", "/anything")).toBe(false);
    expect(isPathAllowed(doc, "gptbot", "/anything")).toBe(false); // case-insensitive
  });
  it("supports wildcard * and end anchor $ in patterns", () => {
    const d = parseRobotsTxt("User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*\n");
    expect(isPathAllowed(d, "bingbot", "/files/a.pdf")).toBe(false);
    expect(isPathAllowed(d, "bingbot", "/files/a.pdfx")).toBe(true);
    expect(isPathAllowed(d, "bingbot", "/tmp/x/y")).toBe(false);
  });
});

describe("evaluateCrawlerAccess", () => {
  it("returns blocked / partial / allowed", () => {
    const doc = parseRobotsTxt(SAMPLE);
    expect(evaluateCrawlerAccess(doc, "GPTBot")).toBe("blocked");
    expect(evaluateCrawlerAccess(doc, "Googlebot")).toBe("partial");
    const open = parseRobotsTxt("User-agent: *\nDisallow:\n");
    expect(evaluateCrawlerAccess(open, "Googlebot")).toBe("allowed");
  });
});

describe("detectRuleConflicts", () => {
  it("detects same-pattern allow+disallow in one group", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    expect(detectRuleConflicts(doc).length).toBe(1);
  });
  it("detects UA-specific full block while wildcard allows", () => {
    const doc = parseRobotsTxt(SAMPLE);
    const conflicts = detectRuleConflicts(doc);
    expect(conflicts.some((c) => c.description.includes("GPTBot".toLowerCase()) || c.description.includes("gptbot"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/seo-core test`
Expected: FAIL — `../robots` module not found.

- [ ] **Step 3: Implement `packages/seo-core/src/robots.ts`**

```ts
export interface RobotsRule {
  readonly type: "allow" | "disallow";
  readonly pattern: string;
  readonly line: number;
}

export interface RobotsGroup {
  readonly userAgents: readonly string[];
  readonly rules: readonly RobotsRule[];
  readonly line: number;
}

export interface RobotsTxtDocument {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
  readonly parseErrors: readonly string[];
}

export function parseRobotsTxt(content: string): RobotsTxtDocument {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const parseErrors: string[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let groupLine = 0;
  let rulesStarted = false;

  const flush = (): void => {
    if (agents.length > 0) {
      groups.push({ userAgents: agents, rules, line: groupLine });
    }
    agents = [];
    rules = [];
    groupLine = 0;
    rulesStarted = false;
  };

  const lines = content.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const hash = rawLine.indexOf("#");
    const text = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    if (!text) return;
    const colon = text.indexOf(":");
    if (colon === -1) {
      parseErrors.push(`Satır ${lineNo}: geçersiz alan`);
      return;
    }
    const field = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (rulesStarted) flush();
      if (agents.length === 0) groupLine = lineNo;
      if (value) agents.push(value.toLowerCase());
      return;
    }
    if (field === "allow" || field === "disallow") {
      if (agents.length === 0) {
        parseErrors.push(`Satır ${lineNo}: user-agent olmadan ${field} kuralı`);
        return;
      }
      rulesStarted = true;
      if (value === "") return; // empty Disallow = allow; empty Allow = no-op
      rules.push({ type: field, pattern: value, line: lineNo });
      return;
    }
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      return;
    }
    // crawl-delay, host, unknown fields: ignored by design
  });
  flush();
  return { groups, sitemaps, parseErrors };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regexBody = body
    .split("")
    .map((ch) => (ch === "*" ? ".*" : escapeRegExp(ch)))
    .join("");
  return new RegExp(`^${regexBody}${anchored ? "$" : ""}`).test(path);
}

function matchingGroups(doc: RobotsTxtDocument, userAgent: string): RobotsGroup[] {
  const ua = userAgent.toLowerCase();
  let best = 0;
  for (const group of doc.groups) {
    for (const token of group.userAgents) {
      if (token !== "*" && ua.startsWith(token) && token.length > best) best = token.length;
    }
  }
  if (best > 0) {
    return doc.groups.filter((g) =>
      g.userAgents.some((t) => t !== "*" && t.length === best && ua.startsWith(t)),
    );
  }
  return doc.groups.filter((g) => g.userAgents.includes("*"));
}

export function isPathAllowed(doc: RobotsTxtDocument, userAgent: string, path: string): boolean {
  const rules = matchingGroups(doc, userAgent).flatMap((g) => g.rules);
  const matching = rules.filter((r) => robotsPatternMatches(r.pattern, path));
  if (matching.length === 0) return true;
  const longest = Math.max(...matching.map((r) => r.pattern.length));
  const winners = matching.filter((r) => r.pattern.length === longest);
  return winners.some((r) => r.type === "allow");
}

export type CrawlerAccessStatus = "allowed" | "blocked" | "partial";

export function evaluateCrawlerAccess(doc: RobotsTxtDocument, userAgent: string): CrawlerAccessStatus {
  if (!isPathAllowed(doc, userAgent, "/")) return "blocked";
  const restricted = matchingGroups(doc, userAgent).some((g) =>
    g.rules.some((r) => r.type === "disallow"),
  );
  return restricted ? "partial" : "allowed";
}

export interface RuleConflict {
  readonly description: string;
  readonly lines: string[];
}

const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);

export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  for (const group of doc.groups) {
    const allows = new Set(group.rules.filter((r) => r.type === "allow").map((r) => r.pattern));
    for (const rule of group.rules) {
      if (rule.type === "disallow" && allows.has(rule.pattern)) {
        conflicts.push({
          description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
          lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
        });
      }
    }
  }
  const wildcards = doc.groups.filter((g) => g.userAgents.includes("*"));
  const wildcardFullBlock = wildcards.some((g) =>
    g.rules.some((r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern)),
  );
  if (wildcards.length > 0 && !wildcardFullBlock) {
    for (const group of doc.groups) {
      if (group.userAgents.includes("*")) continue;
      const fullBlock = group.rules.some(
        (r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern),
      );
      if (fullBlock) {
        conflicts.push({
          description: `${group.userAgents.join(", ")} için tüm site engellenmiş ancak genel (*) grubu izin veriyor — kasıtlı bir politika değilse çakışmadır`,
          lines: [`satır ${group.line}`],
        });
      }
    }
  }
  return conflicts;
}
```

Create `packages/seo-core/src/ai-crawlers.ts`:
```ts
import type { CrawlerAccessStatus, RobotsTxtDocument } from "./robots.js";
import { evaluateCrawlerAccess } from "./robots.js";

export type CrawlerCategory = "ai-training" | "ai-search" | "search";

export interface CrawlerDescriptor {
  readonly userAgent: string;
  readonly label: string;
  readonly category: CrawlerCategory;
}

export interface CrawlerEvaluation extends CrawlerDescriptor {
  readonly status: CrawlerAccessStatus;
}

export const AI_CRAWLER_REGISTRY: readonly CrawlerDescriptor[] = [
  { userAgent: "GPTBot", label: "GPTBot (OpenAI eğitim)", category: "ai-training" },
  { userAgent: "ClaudeBot", label: "ClaudeBot (Anthropic eğitim)", category: "ai-training" },
  { userAgent: "Google-Extended", label: "Google-Extended (Gemini eğitim)", category: "ai-training" },
  { userAgent: "Applebot-Extended", label: "Applebot-Extended (Apple AI eğitim)", category: "ai-training" },
  { userAgent: "CCBot", label: "CCBot (Common Crawl)", category: "ai-training" },
  { userAgent: "Bytespider", label: "Bytespider (ByteDance)", category: "ai-training" },
  { userAgent: "Amazonbot", label: "Amazonbot", category: "ai-training" },
  { userAgent: "meta-externalagent", label: "Meta-ExternalAgent (Meta AI)", category: "ai-training" },
  { userAgent: "OAI-SearchBot", label: "OAI-SearchBot (ChatGPT arama)", category: "ai-search" },
  { userAgent: "ChatGPT-User", label: "ChatGPT-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "Claude-User", label: "Claude-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "PerplexityBot", label: "PerplexityBot", category: "ai-search" },
  { userAgent: "Perplexity-User", label: "Perplexity-User (kullanıcı istekleri)", category: "ai-search" },
  { userAgent: "Googlebot", label: "Googlebot", category: "search" },
  { userAgent: "Bingbot", label: "Bingbot", category: "search" },
  { userAgent: "Applebot", label: "Applebot", category: "search" },
  { userAgent: "DuckDuckBot", label: "DuckDuckBot", category: "search" },
] as const;

export function evaluateAllCrawlers(doc: RobotsTxtDocument): CrawlerEvaluation[] {
  return AI_CRAWLER_REGISTRY.map((c) => ({ ...c, status: evaluateCrawlerAccess(doc, c.userAgent) }));
}
```

Re-export both modules from `packages/seo-core/src/index.ts` (follow the file's existing export style).

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/seo-core test`
Expected: PASS (new + existing suites).

- [ ] **Step 5: Commit**

```bash
git add packages/seo-core
git commit -m "feat(seo-core): add RFC 9309 robots.txt parser and AI crawler registry"
```

---

### Task 2: Worker processor, submission and queue wiring

**Files:**
- Create: `apps/worker/src/processors/ai-crawler-audit.ts`
- Create: `apps/worker/src/queue/ai-crawler-submission.ts`
- Create: `apps/worker/src/queue/ai-crawler-worker.ts`
- Modify: `apps/worker/src/worker.ts` (register `startAiCrawlerWorker`, shutdown)
- Modify: `apps/worker/src/index.ts` (export processor + submission)
- Modify: `apps/worker/package.json` (add `"@seovista/seo-core": "workspace:*"` dependency if absent; run `corepack pnpm@10.30.1 install` after)
- Modify: `apps/worker/src/utils/fetcher.ts` (add `fetchTextSafely` ONLY if no text-safe fetch export exists; reuse its existing hostname/IP validation, timeout and redirect policy; do not change existing exports or behavior)
- Test: `apps/worker/src/__tests__/ai-crawler-audit-processor.test.ts`

**Interfaces:**
- Consumes: `parseRobotsTxt`, `evaluateAllCrawlers`, `detectRuleConflicts` (Task 1); schema-submission/schema-worker plumbing patterns.
- Produces: `processAiCrawlerAuditPayload(robotsTxtContent: string | null, robotsTxtUrl: string): AiCrawlerAuditResultPayload`; `submitAiCrawlerAudit(input: { url: string }): Promise<{ jobId: string }>`; `startAiCrawlerWorker(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/ai-crawler-audit-processor.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { processAiCrawlerAuditPayload } from "../processors/ai-crawler-audit";

describe("processAiCrawlerAuditPayload", () => {
  it("evaluates crawlers and penalizes blocked AI search bots only", () => {
    const txt = "User-agent: *\nDisallow:\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml\n";
    const result = processAiCrawlerAuditPayload(txt, "https://example.com/robots.txt");
    expect(result.robotsTxtFound).toBe(true);
    const search = result.crawlers.find((c) => c.userAgent === "OAI-SearchBot");
    const training = result.crawlers.find((c) => c.userAgent === "GPTBot");
    expect(search?.status).toBe("blocked");
    expect(training?.status).toBe("blocked");
    expect(result.score).toBe(88); // 100 - 12 (ai-search block); ai-training block carries no penalty
  });

  it("caps score at 60 when robots.txt is missing and recommends creating one", () => {
    const result = processAiCrawlerAuditPayload(null, "https://example.com/robots.txt");
    expect(result.robotsTxtFound).toBe(false);
    expect(result.score).toBe(60);
    expect(result.crawlers.every((c) => c.status === "allowed")).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/worker test src/__tests__/ai-crawler-audit-processor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement processor**

Create `apps/worker/src/processors/ai-crawler-audit.ts`:
```ts
import {
  detectRuleConflicts,
  evaluateAllCrawlers,
  parseRobotsTxt,
  type CrawlerCategory,
  type CrawlerAccessStatus,
  type RuleConflict,
} from "@seovista/seo-core";

export interface AiCrawlerAuditResultPayload {
  readonly score: number;
  readonly robotsTxtFound: boolean;
  readonly robotsTxtUrl: string;
  readonly sitemaps: readonly string[];
  readonly crawlers: ReadonlyArray<{
    userAgent: string;
    label: string;
    category: CrawlerCategory;
    status: CrawlerAccessStatus;
  }>;
  readonly conflicts: readonly RuleConflict[];
  readonly recommendations: readonly string[];
  readonly parseErrors: readonly string[];
}

const BLOCK_PENALTY_SEARCH = 12;
const CONFLICT_PENALTY = 8;
const CONFLICT_PENALTY_CAP = 24;
const MISSING_ROBOTS_CAP = 60;
const MISSING_SITEMAP_PENALTY = 5;

export function processAiCrawlerAuditPayload(
  robotsTxtContent: string | null,
  robotsTxtUrl: string,
): AiCrawlerAuditResultPayload {
  const found = robotsTxtContent !== null;
  const doc = parseRobotsTxt(robotsTxtContent ?? "");
  const crawlers = evaluateAllCrawlers(doc);
  const conflicts = found ? detectRuleConflicts(doc) : [];
  const recommendations: string[] = [];

  let penalty = 0;
  for (const crawler of crawlers) {
    if (crawler.status === "blocked" && crawler.category !== "ai-training") {
      penalty += BLOCK_PENALTY_SEARCH;
      recommendations.push(
        `${crawler.label} tamamen engellenmiş — AI cevap motorlarında görünürlüğünüz azalır. Engellemek istemiyorsanız ilgili Disallow kuralını kaldırın.`,
      );
    }
  }
  penalty += Math.min(conflicts.length * CONFLICT_PENALTY, CONFLICT_PENALTY_CAP);

  let score = Math.max(0, 100 - penalty);

  if (!found) {
    score = Math.min(score, MISSING_ROBOTS_CAP);
    recommendations.push(
      "robots.txt dosyanız bulunamadı. Varsayılan olarak tüm botlara açık sayılırsınız; net bir politika için robots.txt oluşturup Sitemap direktifi ekleyin.",
    );
  } else if (doc.sitemaps.length === 0) {
    score = Math.max(0, score - MISSING_SITEMAP_PENALTY);
    recommendations.push(
      "robots.txt içinde Sitemap direktifi bulunamadı. Sitemap: <tam-url> satırı eklemek arama ve AI botlarının sitenizi daha verimli keşfetmesini sağlar.",
    );
  }
  for (const conflict of conflicts) {
    recommendations.push(`Kural çakışması: ${conflict.description}`);
  }

  return {
    score,
    robotsTxtFound: found,
    robotsTxtUrl,
    sitemaps: doc.sitemaps,
    crawlers,
    conflicts,
    recommendations,
    parseErrors: doc.parseErrors,
  };
}
```

- [ ] **Step 4: Implement submission + worker by mirroring schema plumbing**

First READ `apps/worker/src/queue/schema-submission.ts` and `apps/worker/src/queue/schema-worker.ts` fully. Then create `ai-crawler-submission.ts` and `ai-crawler-worker.ts` as structural copies with these substitutions:
- queue_name: `'schema_audit'` → `'ai_crawler_audit'`
- BullMQ queue name: `'schema_audit_jobs'` → `'ai_crawler_audit_jobs'`
- env override: `SCHEMA_QUEUE_NAME` → `AI_CRAWLER_QUEUE_NAME`
- result_type: `'schema:result'` → `'ai-crawler:result'`
- Worker body: derive `const robotsUrl = new URL("/robots.txt", url).toString()`, fetch it via the SSRF-safe text fetch from `utils/fetcher.ts` (add `fetchTextSafely` there if none exists — reuse the same DNS/IP validation helpers the existing page fetch uses). HTTP 404 → `processAiCrawlerAuditPayload(null, robotsUrl)`; other non-2xx or fetch error → job `failed` with the honest error. 2xx → `processAiCrawlerAuditPayload(body, robotsUrl)` and write `job_results` + transition to `completed` exactly as schema-worker does.
- Register in `apps/worker/src/worker.ts` beside `startSchemaWorker` (startup + shutdown), export from `apps/worker/src/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm@10.30.1 --filter @seovista/worker test src/__tests__/ai-crawler-audit-processor.test.ts`
Expected: PASS. Also run `corepack pnpm@10.30.1 --filter @seovista/worker typecheck` — 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/worker pnpm-lock.yaml
git commit -m "feat(worker): add AI crawler audit queue, submission and worker chain"
```

---

### Task 3: Web form, server action, shared url-safety + score-band

**Files:**
- Create: `apps/web/src/lib/url-safety.ts`
- Create: `apps/web/src/lib/score-band.ts`
- Create: `apps/web/src/lib/ai-crawler-checker/validation.ts`
- Create: `apps/web/src/lib/ai-crawler-checker/actions.ts`
- Create: `apps/web/app/tools/ai-crawler-checker/page.tsx`
- Modify: schema-checker imports (`apps/web/src/lib/schema-checker/validation.ts` and/or `actions.ts`, `apps/web/src/lib/schema-checker/score-band.ts` consumers, `apps/web/src/lib/schema-checker/__tests__/score-band.test.ts`) to use the two shared modules; delete the now-duplicated local copies
- Test: `apps/web/src/lib/ai-crawler-checker/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `submitAiCrawlerAudit` (Task 2, via worker package boundary the same way schema-checker actions consume `submitSchemaAudit` — READ `apps/web/src/lib/schema-checker/actions.ts` first and mirror its import path, rate limiting and redirect handling).
- Produces: `validateAiCrawlerInput(url)`, `startAiCrawlerAuditAction(prevState, formData)`, `isSafePublicHttpUrl(url)` (shared), `getSchemaScoreBand(score)` (shared, keep existing name/signature so schema-checker tests pass unchanged apart from import paths).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ai-crawler-checker/__tests__/actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { validateAiCrawlerInput } from "../validation";

describe("validateAiCrawlerInput", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateAiCrawlerInput("https://example.com").success).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(validateAiCrawlerInput("not-a-url").success).toBe(false);
  });
  it("rejects metadata and loopback targets", () => {
    expect(validateAiCrawlerInput("http://169.254.169.254/").success).toBe(false);
    expect(validateAiCrawlerInput("http://127.0.0.2/").success).toBe(false);
    expect(validateAiCrawlerInput("http://[::1]/").success).toBe(false);
  });
  it("rejects non-http protocols", () => {
    expect(validateAiCrawlerInput("file:///etc/passwd").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/lib/ai-crawler-checker/__tests__/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extract shared modules, implement validation + action + page**

1. Locate the hardened SSRF guard (grep for `169.254` under `apps/web/src/lib/schema-checker/`). Move it verbatim to `apps/web/src/lib/url-safety.ts` as `export function isSafePublicHttpUrl(url: string): boolean`. Update schema-checker to import from there; remove the local copy.
2. Move `apps/web/src/lib/schema-checker/score-band.ts` to `apps/web/src/lib/score-band.ts`; update its consumers (schema result page, `SchemaScoreOverview`, `score-band.test.ts`) to the new path. Keep function name/signature unchanged.
3. Create `apps/web/src/lib/ai-crawler-checker/validation.ts` (NO `"use server"`): Zod schema `z.string().url("Geçerli bir URL giriniz.").refine(isSafePublicHttpUrl, "Bu adrese erişim güvenlik nedeniyle engellendi.")` and `export function validateAiCrawlerInput(url: string)` returning `safeParse` result.
4. Create `apps/web/src/lib/ai-crawler-checker/actions.ts` mirroring `apps/web/src/lib/schema-checker/actions.ts`: same rate limiting, same error/redirect (`NEXT_REDIRECT` digest rethrow) handling, calling `submitAiCrawlerAudit({ url })` and redirecting to `/tools/ai-crawler-checker/result/${jobId}`.
5. Create `apps/web/app/tools/ai-crawler-checker/page.tsx` mirroring `apps/web/app/tools/schema-checker/page.tsx`: one `<main>`, one `<h1>` ("AI Crawler Checker"), Turkish copy explaining the tool, single URL field, `useActionState`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/lib/ai-crawler-checker src/lib/schema-checker`
Expected: PASS (new tests + existing schema-checker tests after import updates). Then `corepack pnpm@10.30.1 --filter @seovista/web typecheck` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add AI Crawler Checker form, shared url-safety and score-band modules"
```

---

### Task 4: Result page, access matrix components, tools index

**Files:**
- Create: `apps/web/app/tools/ai-crawler-checker/result/[jobId]/page.tsx`
- Create: `apps/web/src/components/ai-crawler-checker/crawler-access-matrix.tsx`
- Create: `apps/web/src/components/ai-crawler-checker/crawler-issues.tsx`
- Modify: `apps/web/app/tools/page.tsx` (add Schema Checker + AI Crawler Checker instruments with `Preview` status and hrefs)
- Test: `apps/web/src/components/ai-crawler-checker/__tests__/crawler-access-matrix.test.tsx`

**Interfaces:**
- Consumes: shared `getSchemaScoreBand`, `AuditPoller` + `CrewCtaView` (find their import paths by READING `apps/web/app/tools/schema-checker/result/[jobId]/page.tsx` first and mirror its DB query with `queue_name = 'ai_crawler_audit'`), payload type from Task 2.
- Produces: `CrawlerAccessMatrix({ crawlers })`, `CrawlerIssues({ conflicts, recommendations })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ai-crawler-checker/__tests__/crawler-access-matrix.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrawlerAccessMatrix } from "../crawler-access-matrix";

const crawlers = [
  { userAgent: "OAI-SearchBot", label: "OAI-SearchBot (ChatGPT arama)", category: "ai-search" as const, status: "blocked" as const },
  { userAgent: "GPTBot", label: "GPTBot (OpenAI eğitim)", category: "ai-training" as const, status: "blocked" as const },
  { userAgent: "Googlebot", label: "Googlebot", category: "search" as const, status: "allowed" as const },
];

describe("CrawlerAccessMatrix", () => {
  it("renders status text per bot (not color-only)", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getAllByText("Engelli").length).toBeGreaterThan(0);
    expect(screen.getAllByText("İzinli").length).toBeGreaterThan(0);
  });
  it("marks blocked ai-training bots as a neutral policy choice", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/politika tercihi/i)).toBeInTheDocument();
  });
  it("renders category group headings", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/AI Arama/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/ai-crawler-checker`
Expected: FAIL.

- [ ] **Step 3: Implement components, result page, tools index**

1. `crawler-access-matrix.tsx`: server component; groups crawlers by category with Turkish headings ("AI Arama & Cevap Botları", "AI Eğitim Botları", "Geleneksel Arama Botları"); each row shows label + status badge with icon + text ("İzinli" ✓, "Kısmi" ◐, "Engelli" ✕). For `ai-training` + `blocked`, append neutral note "Engelleme bir politika tercihidir — hata değildir" (satisfies test 2). `aria-label` on badges.
2. `crawler-issues.tsx`: renders conflicts (warning callout) and recommendations (ordered list), Turkish headings.
3. Result page: READ `apps/web/app/tools/schema-checker/result/[jobId]/page.tsx` and mirror it: UUID validation, `job_records LEFT JOIN job_results ON correlation_id` filtered `queue_name = 'ai_crawler_audit'` (`ORDER BY r.created_at DESC LIMIT 1`), payload parse with try/catch + fallbacks, in-flight `AuditPoller`, failure state, score band via shared `getSchemaScoreBand`, renders robots.txt found/missing callout, sitemap list, `CrawlerAccessMatrix`, `CrawlerIssues`, `CrewCtaView`. One `<main>` + one `<h1>`.
4. `apps/web/app/tools/page.tsx`: add two instruments to the `instruments` array — Schema Checker (`/tools/schema-checker/`, status "Preview") and AI Crawler Checker (`/tools/ai-crawler-checker/`, status "Preview"), renumber ids; keep existing rows intact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm@10.30.1 --filter @seovista/web test src/components/ai-crawler-checker`
Expected: PASS. Then full gates: `corepack pnpm@10.30.1 typecheck` (0 errors) and `corepack pnpm@10.30.1 lint` (0 errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add AI Crawler Checker result page, access matrix and tools index entries"
```
