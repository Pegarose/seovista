# Debt Batch (B8, M1, M2, M5, T3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five deferred review findings (T3 translation parity, B8 parser test gaps, M1 conflict-detector dedup + validation-coded error, M2 worker test coverage, M5 logger injection) in one debt-batch on branch `bugfix/foundation-geo-recovery-real`.

**Architecture:** No new runtime behavior. Six dependency-ordered tasks across `packages/seo-core`, `packages/geo-engine`, `apps/web`, and `apps/worker`. TDD for every code-touching task. Each task produces one commit with its own tests.

**Tech Stack:** TypeScript strict, Vitest, pnpm 10.30.1, Next.js App Router (RSC), BullMQ, `@seovista/seo-core`, `@seovista/geo-engine`.

## Global Constraints

- TypeScript strict mode (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`). No untyped business logic.
- pnpm exclusively; never npm or yarn. Node 24 LTS pinned (environment runs 25 — harmless engine warning).
- Turkish-default UI per PRD §0.3; never fabricate metrics, customers, or results.
- Droid-Shield: use `crypto.randomUUID()` in tests, never hardcode UUID literals.
- Server Components by default; Client Components only for genuine browser interaction.
- Worker tests require lifecycle context: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'` before `pnpm --filter @seovista/worker test`. Start infra with `node scripts/infrastructure-lifecycle.js start <runId>` if the context file is stale.
- Do not commit `apps/web/tsconfig.json` (Next.js auto-artifact) or `.superpowers/sdd/` scratch files.
- Known acceptable worker test failures: geo-worker 429 (DNS wildcard), Crew Agency notify (env), migration-invariants advisory lock.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/geo-checker/issue-translations.ts` | **Create** | `ISSUE_TRANSLATIONS` dict + `MODULE_STATUS_LABEL` (extracted from score-breakdown.tsx), 6 new entries |
| `apps/web/src/components/geo-checker/score-breakdown.tsx` | Modify | Import dict from new module instead of defining inline |
| `apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts` | **Create** | Parity test: `CODE_TO_TAGS` keys ⊆ dict keys |
| `packages/seo-core/src/__tests__/robots.test.ts` | Modify | 11 new edge-case tests + `detectContradictoryRuleConflicts` block |
| `packages/seo-core/src/robots.ts` | Modify | Export `detectContradictoryRuleConflicts`; refactor `detectRuleConflicts` to use it |
| `packages/seo-core/src/index.ts` | Modify | Re-export `detectContradictoryRuleConflicts` |
| `apps/worker/src/processors/ai-crawler-audit.ts` | Modify | Delete local `findContradictoryRuleConflicts`; import from seo-core |
| `apps/worker/src/processors/crew-report.ts` | Modify | Unknown-tool throw → `validationCrewReportError` |
| `apps/worker/src/__tests__/crew-report-processor.test.ts` | Modify | Add unknown-tool code assertion |
| `apps/worker/src/queue/crew-report-worker.ts` | Modify | Extract `processCrewReportJob(data, deps)`; thin `startCrewReportWorker` wiring |
| `apps/worker/src/__tests__/crew-report-worker.test.ts` | **Create** | 7+ cases: happy path, terminal mapping, poll ceiling, markdown variants |
| `apps/worker/src/utils/logger.ts` | **Create** | `Logger` type, `stdoutLogger` (single eslint-disabled site), `noopLogger` |
| `apps/worker/src/db/admin-seed.ts` | Modify | Default logger → `stdoutLogger` |
| `apps/worker/src/db/dev-seed.ts` | Modify | `main(logger)` param; 11 `console.log` → `logger` |
| `apps/worker/src/utils/fetcher.ts` | Modify | `FetchAndParseUrlOptions.logger?`; 2 `console.log` → `logger` |

---

## Task 1: T3 — Translation completion + parity guard

**Files:**
- Create: `apps/web/src/components/geo-checker/issue-translations.ts`
- Create: `apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts`
- Modify: `apps/web/src/components/geo-checker/score-breakdown.tsx`

**Interfaces:**
- Consumes: `CODE_TO_TAGS` from `@seovista/geo-engine` (already exported from `packages/geo-engine/src/index.ts:20`)
- Produces: `ISSUE_TRANSLATIONS: Record<string, string>` and `MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string>` exported from `issue-translations.ts`

- [ ] **Step 1: Create the extracted translations module with 6 new entries**

Create `apps/web/src/components/geo-checker/issue-translations.ts`:

```ts
import type { ScoreBreakdownModule } from "@seovista/geo-engine";

/**
 * Render-friendly Turkish status labels for a scoring module's `status` band.
 *
 * The numeric `score` / `maxScore` is always rendered alongside the label so
 * the band is never communicated by color or label alone — keyboard and
 * screen-reader users see the concrete numbers. Labels mirror the
 * confidence-labeling convention (Turkish-default per master PRD §0.3).
 */
export const MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string> = {
  excellent: "Mükemmel",
  good: "İyi",
  needs_improvement: "Geliştirilmeli",
  poor: "Zayıf",
  critical: "Kritik",
};

/**
 * Türkçe sorun açıklamaları sözlüğü.
 *
 * Coverage invariant: every issue `code` the geo-engine can emit (i.e. every
 * key of `CODE_TO_TAGS` in `packages/geo-engine/src/issue-tags.ts`) MUST have
 * an entry here. The companion test `issue-translations.test.ts` enforces this
 * so a future engine code never silently falls back to the English
 * `AuditIssue.title` in the Turkish UI.
 */
export const ISSUE_TRANSLATIONS: Record<string, string> = {
  ANSWER_BLOCK_OPPORTUNITY: "İçerikte net soru-cevap veya FAQ blokları eksik.",
  CITATION_READINESS_WEAK: "Yetkili dış kaynaklara atıf ve bağlantı sayısı sınırlı.",
  AI_PARSEABILITY_RISK: "Yapılandırılmış liste veya tablo biçimlendirmesi bulunamadı.",
  ENTITY_CLARITY_WEAK: "Ana konu kavramları ve varlık tanımları açıkça belirtilmemiş.",
  THIRD_PARTY_MENTION_DATA_UNAVAILABLE: "Üçüncü taraf marka anılma verisi henüz entegre edilmedi.",
  PLATFORM_READINESS_LIMITED: "Yapay zeka platformlarında alıntılanma hazırığı sınırlı.",
  LOW_STRUCTURE_QUALITY: "İçerik yapısı zayıf (Alt başlıklar eksik).",
  NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC: "Karmaşık konular için liste veya tablo kullanımı bulunmuyor.",
  THIN_CONTENT_RISK: "Yetersiz / sığ içerik tespiti.",
  INTRO_MISSING_OR_WEAK: "Ana konu giriş paragrafında yer almıyor.",
  KEYWORD_STUFFING_RISK: "Aşırı anahtar kelime kullanımı riski.",
  CONTENT_INTENT_MISMATCH_RISK: "Arama amacı ve sayfa tipi uyumsuzluğu.",
  HTTPS_MISSING: "Güvenli HTTPS bağlantısı eksik.",
  HTML_SIZE_LARGE: "HTML dosya boyutu çok yüksek.",
  DOM_SIZE_LARGE: "DOM düğüm sayısı yüksek.",
  HTTP_5XX_DETECTED: "Sunucu hatası (HTTP 5xx) tespit edildi.",
  HTTP_4XX_DETECTED: "Sayfa bulunamadı veya erişim hatası (HTTP 4xx).",
  HTTP_STATUS_NOT_OK: "Sayfa 200 OK yerine beklenmeyen bir HTTP durum kodu döndürüyor.",
  NOINDEX_DETECTED: "Sayfa noindex etiketi içeriyor.",
  NOFOLLOW_DETECTED: "Sayfa nofollow etiketi içeriyor.",
  CANONICAL_MISSING: "Canonical URL etiketi eksik.",
  CANONICAL_DOMAIN_MISMATCH: "Canonical etiketinde alan adı uyumsuzluğu.",
  CANONICAL_NON_SELF_REFERENCING: "Canonical etiketi kendini işaret etmiyor.",
  CSR_RENDER_RISK: "İçerik yalnızca istemci tarafında (JS) oluşturuluyor.",
  STATIC_HTML_CONTENT_MISSING: "Statik HTML içinde metin içeriği bulunamadı.",
  MAIN_CONTENT_EMPTY: "Ana içerik alanı boş görünüyor.",
  NO_INTERNAL_LINKS: "Sayfada iç bağlantı bulunmuyor.",
  GENERIC_ANCHOR_TEXT: "Genel / belirsiz bağlantı metinleri kullanılmış.",
  EMPTY_ANCHOR_TEXT: "Metinsiz boş bağlantılar tespit edildi.",
  EXCESSIVE_EXTERNAL_LINKS: "Aşırı sayıda dış bağlantı mevcut.",
  TARGET_KEYWORD_NOT_IN_TITLE: "Hedef konu title etiketinde yer almıyor.",
  TARGET_KEYWORD_NOT_IN_H1: "Hedef konu H1 başlığında bulunmuyor.",
  TARGET_KEYWORD_NOT_IN_INTRO: "Hedef konu ilk içerik paragrafında yer almıyor.",
  LOW_SEMANTIC_COVERAGE: "Ana konunun içerikteki anlamsal kapsamı sınırlı.",
  SEMANTIC_GAP_DETECTED: "Ana konu içerikte bulunamadı.",
  HEADING_COVERAGE_WEAK: "Alt başlıklar ana konuyu yeterince yansıtmıyor.",
  INFORMATION_GAIN_OPPORTUNITY: "İçerik ek alt konularla zenginleştirilebilir.",
  PRIMARY_TOPIC_UNCLEAR: "Sayfanın ana konusu anlaşılamadı.",
  TOPIC_INFERENCE_LOW_CONFIDENCE: "Ana konu düşük güvenle çıkarıldı.",
  TARGET_KEYWORD_NOT_PROVIDED: "Hedef anahtar kelime girilmedi — anlamsal analiz genel konu bazlı çalıştırıldı.",
  TITLE_MISSING: "Sayfa başlığı (Title tag) eksik.",
  TITLE_TOO_SHORT: "Sayfa başlığı çok kısa.",
  TITLE_TOO_LONG: "Sayfa başlığı çok uzun.",
  META_DESCRIPTION_MISSING: "Meta açıklama (Meta description) eksik.",
  META_DESCRIPTION_TOO_SHORT: "Meta açıklama çok kısa.",
  META_DESCRIPTION_TOO_LONG: "Meta açıklama çok uzun.",
  H1_MISSING: "H1 başlığı eksik.",
  MULTIPLE_H1: "Birden fazla H1 başlığı kullanılmış.",
  OPEN_GRAPH_INCOMPLETE: "Open Graph sosyal medya etiketleri eksik.",
  TWITTER_CARD_INCOMPLETE: "Twitter Card etiketleri eksik.",
  JSON_LD_INVALID: "Geçersiz JSON-LD yapısal verisi.",
  BREADCRUMB_SCHEMA_MISSING: "Breadcrumb yapısal verisi eksik.",
  JSON_LD_MISSING_RECOMMENDED_SCHEMA: "Önerilen schema yapısal verileri eksik.",
  PAGESPEED_PROVIDER_FAILED: "Sayfa hızı verisi alınamadı (PageSpeed API hatası).",
  PAGESPEED_SKIPPED: "Sayfa hızı (Core Web Vitals) bu analizde ölçülmedi.",
  SEMANTIC_LSI_GAP: "İçerikte rakip sayfalarda bulunan anlamsal (LSI) terimler eksik.",
  SEMANTIC_ENTITY_GAP: "İçerikte konuyla ilişkili önemli varlıklar (entity) eksik.",
  SEMANTIC_ENRICHMENT_UNAVAILABLE: "Anlamsal zenginleştirme verisi bu analizde alınamadı; skor etkilenmedi.",
};
```

- [ ] **Step 2: Write the failing parity test**

Create `apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CODE_TO_TAGS } from "@seovista/geo-engine";
import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "../issue-translations";

describe("ISSUE_TRANSLATIONS parity with geo-engine", () => {
  it("every CODE_TO_TAGS key has a non-empty Turkish translation", () => {
    const engineCodes = Object.keys(CODE_TO_TAGS);
    const dictCodes = Object.keys(ISSUE_TRANSLATIONS);
    const missing = engineCodes.filter((code) => !dictCodes.includes(code));
    expect(missing, `Missing translations for: ${missing.join(", ")}`).toEqual([]);
  });

  it("every translation value is a non-empty trimmed string", () => {
    for (const [code, value] of Object.entries(ISSUE_TRANSLATIONS)) {
      expect(typeof value, `${code} value type`).toBe("string");
      expect(value.trim().length, `${code} value must be non-empty`).toBeGreaterThan(0);
    }
  });
});

describe("MODULE_STATUS_LABEL", () => {
  it("covers all status bands with non-empty Turkish labels", () => {
    const bands = ["excellent", "good", "needs_improvement", "poor", "critical"] as const;
    for (const band of bands) {
      expect(MODULE_STATUS_LABEL[band].trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run the parity test to verify it passes**

Run: `pnpm --filter @seovista/web test -- src/components/geo-checker/__tests__/issue-translations.test.ts`
Expected: PASS (the dict now has all 6 new entries; `CODE_TO_TAGS` has 61 keys — verify the dict has ≥61 entries).

- [ ] **Step 4: Update score-breakdown.tsx to import from the new module**

In `apps/web/src/components/geo-checker/score-breakdown.tsx`:

1. Replace the `import type { ScoreBreakdown, ScoreBreakdownModule } from "@seovista/geo-engine";` line and the inline `MODULE_STATUS_LABEL` + `ISSUE_TRANSLATIONS` const blocks with an import. The top of the file should become:

```ts
import type { ReactElement } from "react";
import type { ScoreBreakdown } from "@seovista/geo-engine";
import { PlatformConfidenceView } from "./platform-confidence";
import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "./issue-translations";
```

Delete the entire `MODULE_STATUS_LABEL` const (lines ~10-21) and the entire `ISSUE_TRANSLATIONS` const (lines ~22-71, the `/** Türkçe sorun açıklamaları sözlüğü */` block through its closing `};`). Keep everything else (the `PointLossBadge` function onward) unchanged.

- [ ] **Step 5: Run the full web test suite to verify nothing broke**

Run: `pnpm --filter @seovista/web test`
Expected: PASS — all existing tests green, plus the 3 new test cases. If `seo.spec.ts` or any geo-checker test fails because it referenced the old inline consts, update the import to use `issue-translations.ts`.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/geo-checker/issue-translations.ts apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts apps/web/src/components/geo-checker/score-breakdown.tsx
git commit -m "fix(geo-checker): complete ISSUE_TRANSLATIONS parity with geo-engine codes

Extract ISSUE_TRANSLATIONS + MODULE_STATUS_LABEL into issue-translations.ts.
Add 6 missing entries (HTTP_STATUS_NOT_OK, PAGESPEED_*, SEMANTIC_*). Add
parity test asserting CODE_TO_TAGS keys ⊆ dict keys."
```

---

## Task 2: B8 — robots parser edge-case tests

**Files:**
- Modify: `packages/seo-core/src/__tests__/robots.test.ts`

**Interfaces:**
- Consumes: `parseRobotsTxt`, `isPathAllowed`, `detectRuleConflicts` (and `detectContradictoryRuleConflicts` after Task 3) from `../robots`
- Produces: nothing (test-only)

- [ ] **Step 1: Add the edge-case tests**

Append the following `describe` blocks to the end of `packages/seo-core/src/__tests__/robots.test.ts`. Add `detectContradictoryRuleConflicts` to the existing import from `../robots` only after Task 3 exports it — for this task, the import stays as-is.

```ts
describe("parseRobotsTxt edge cases", () => {
  it("strips a leading UTF-8 BOM", () => {
    const doc = parseRobotsTxt("\uFEFFUser-agent: *\nDisallow: /private\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("splits CRLF (\\r\\n) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\r\nDisallow: /a\r\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("splits lone CR (\\r) line endings", () => {
    const doc = parseRobotsTxt("User-agent: *\rDisallow: /a\r");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
  });

  it("strips inline # comments on rule lines", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow: /admin # keep out\n");
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/admin");
  });

  it("records a parseError for a line without a colon", () => {
    const doc = parseRobotsTxt("User-agent: *\nthis-has-no-colon\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/geçersiz alan/);
  });

  it("records a parseError for a rule before any user-agent", () => {
    const doc = parseRobotsTxt("Disallow: /secret\nUser-agent: *\n");
    expect(doc.parseErrors.length).toBe(1);
    expect(doc.parseErrors[0]).toMatch(/user-agent olmadan/);
  });

  it("treats empty Allow as a no-op (rule not pushed)", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow:\nDisallow: /x\n");
    expect(doc.groups[0]?.rules).toHaveLength(1);
    expect(doc.groups[0]?.rules[0]?.type).toBe("disallow");
  });

  it("accumulates multiple User-agent lines into one group", () => {
    const doc = parseRobotsTxt("User-agent: Googlebot\nUser-agent: GPTBot\nDisallow: /both\n");
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0]?.userAgents).toEqual(["googlebot", "gptbot"]);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("is case-insensitive on field names (USER-AGENT)", () => {
    const doc = parseRobotsTxt("USER-AGENT: *\nDISALLOW: /x\n");
    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/x");
  });

  it("ignores unknown fields (Crawl-delay, Host) without error", () => {
    const doc = parseRobotsTxt("User-agent: *\nCrawl-delay: 10\nHost: example.com\nDisallow: /x\n");
    expect(doc.parseErrors).toHaveLength(0);
    expect(doc.groups[0]?.rules).toHaveLength(1);
  });

  it("skips an empty Sitemap value", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nSitemap:\n");
    expect(doc.sitemaps).toHaveLength(0);
  });
});

describe("isPathAllowed tie-break", () => {
  it("allow wins when Allow and Disallow patterns have equal length", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    expect(isPathAllowed(doc, "Googlebot", "/x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they pass against the existing parser**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: PASS — all existing + 12 new tests green. If any test FAILS, the parser has a real bug; fix it in `packages/seo-core/src/robots.ts` in the same task (red→green), and note the fix in the commit message.

- [ ] **Step 3: Run the full seo-core suite**

Run: `pnpm --filter @seovista/seo-core test`
Expected: PASS (count increases by 12).

- [ ] **Step 4: Commit**

```bash
git add packages/seo-core/src/__tests__/robots.test.ts
git commit -m "test(seo-core): cover robots parser edge cases (B8)

Add 12 edge-case tests: BOM, CRLF/CR endings, inline comments, colon-less
lines, rule-before-UA, empty Allow, multi-UA groups, field case-insensitivity,
unknown fields, empty sitemap, allow-wins tie-break."
```

---

## Task 3: M1(a) — conflict-detector dedup

**Files:**
- Modify: `packages/seo-core/src/robots.ts`
- Modify: `packages/seo-core/src/index.ts`
- Modify: `apps/worker/src/processors/ai-crawler-audit.ts`

**Interfaces:**
- Produces: `detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[]` exported from `@seovista/seo-core`

- [ ] **Step 1: Write the failing test for the narrow helper**

In `packages/seo-core/src/__tests__/robots.test.ts`, add `detectContradictoryRuleConflicts` to the import from `../robots`:

```ts
import {
  detectRuleConflicts,
  detectContradictoryRuleConflicts,
  evaluateCrawlerAccess,
  isPathAllowed,
  parseRobotsTxt,
} from "../robots";
```

Append at the end of the file:

```ts
describe("detectContradictoryRuleConflicts", () => {
  it("detects same-pattern allow+disallow in one group", () => {
    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
    const conflicts = detectContradictoryRuleConflicts(doc);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.description).toContain("/x");
  });

  it("does NOT report the wildcard-policy-vs-UA-full-block conflict (that stays in detectRuleConflicts)", () => {
    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nUser-agent: GPTBot\nDisallow: /\n");
    expect(detectContradictoryRuleConflicts(doc)).toHaveLength(0);
    // The full detectRuleConflicts DOES report it:
    expect(detectRuleConflicts(doc).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: FAIL — `detectContradictoryRuleConflicts` is not exported.

- [ ] **Step 3: Extract and export the helper in robots.ts**

In `packages/seo-core/src/robots.ts`, replace the existing `detectRuleConflicts` function with a split version. Find the block starting at `const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);` and the `export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {` function. Replace the first half of `detectRuleConflicts` (the same-pattern Allow/Disallow loop) with a call to the new exported helper:

```ts
const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);

/**
 * Detects genuine rule contradictions: the same path carrying both an Allow
 * and a Disallow rule inside one group. This is the narrow, penalty-relevant
 * subset of {@link detectRuleConflicts} — the worker's AI-crawler audit uses
 * it directly so it does not duplicate the logic (M1(a) drift fix).
 */
export function detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
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
  return conflicts;
}

export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
  const conflicts: RuleConflict[] = detectContradictoryRuleConflicts(doc);

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

- [ ] **Step 4: Re-export from index.ts**

In `packages/seo-core/src/index.ts`, add `detectContradictoryRuleConflicts` to the existing robots export block (the one that exports `parseRobotsTxt, robotsPatternMatches, isPathAllowed, evaluateCrawlerAccess, detectRuleConflicts`):

```ts
export {
  parseRobotsTxt,
  robotsPatternMatches,
  isPathAllowed,
  evaluateCrawlerAccess,
  detectRuleConflicts,
  detectContradictoryRuleConflicts,
} from "./robots.js";
```

- [ ] **Step 5: Run seo-core tests to verify the helper + existing detectRuleConflicts pass**

Run: `pnpm --filter @seovista/seo-core test -- src/__tests__/robots.test.ts`
Expected: PASS — the 2 new helper tests + all existing `detectRuleConflicts` tests green.

- [ ] **Step 6: Update the worker processor to use the seo-core helper**

In `apps/worker/src/processors/ai-crawler-audit.ts`:

1. Add `detectContradictoryRuleConflicts` to the import from `@seovista/seo-core`:

```ts
import {
  detectContradictoryRuleConflicts,
  detectRuleConflicts,
  evaluateAllCrawlers,
  parseRobotsTxt,
  type CrawlerCategory,
  type CrawlerAccessStatus,
  type RobotsTxtDocument,
  type RuleConflict,
} from "@seovista/seo-core";
```

2. Delete the entire local `findContradictoryRuleConflicts` function (the function with its doc comment, from `/**\n * Detects genuine rule contradictions...` through its closing `}`).

3. Replace the two call sites of `findContradictoryRuleConflicts(doc)` with `detectContradictoryRuleConflicts(doc)`:
   - `const contradictoryConflicts = found ? findContradictoryRuleConflicts(doc) : [];` → `const contradictoryConflicts = found ? detectContradictoryRuleConflicts(doc) : [];`

- [ ] **Step 7: Run worker ai-crawler processor tests**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/ai-crawler-audit-processor.test.ts
```
Expected: PASS — the processor's behavior is unchanged.

- [ ] **Step 8: Typecheck both packages**

Run:
```powershell
pnpm --filter @seovista/seo-core typecheck
pnpm --filter @seovista/worker typecheck
```
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/seo-core/src/robots.ts packages/seo-core/src/index.ts packages/seo-core/src/__tests__/robots.test.ts apps/worker/src/processors/ai-crawler-audit.ts
git commit -m "refactor: dedup conflict-detector (M1a)

Export detectContradictoryRuleConflicts from seo-core; detectRuleConflicts
uses it internally. Worker ai-crawler-audit imports the helper instead of
duplicating the allow/disallow contradiction loop."
```

---

## Task 4: M1(b) — validation-coded unknown-tool error

**Files:**
- Modify: `apps/worker/src/processors/crew-report.ts`
- Modify: `apps/worker/src/__tests__/crew-report-processor.test.ts`

**Interfaces:**
- Consumes: `validationCrewReportError` (already defined in `crew-report.ts:293`)

- [ ] **Step 1: Write the failing test**

In `apps/worker/src/__tests__/crew-report-processor.test.ts`, add a new test case (inside the existing top-level `describe` or a new one — match the file's style):

```ts
it("buildCrewReportRequest throws a validation-coded error for an unknown tool", () => {
  expect(() =>
    buildCrewReportRequest({ tool: "bogus" as never, sourcePayload: {}, sourceTarget: undefined }),
  ).toThrow(/Unknown crew report tool/);

  try {
    buildCrewReportRequest({ tool: "bogus" as never, sourcePayload: {}, sourceTarget: undefined });
  } catch (err) {
    expect((err as Error & { code?: string }).code).toBe("validation.crew_report");
  }
});
```

Ensure `buildCrewReportRequest` is imported from `../processors/crew-report.js` (add to existing imports if not already).

- [ ] **Step 2: Run the test to verify it fails**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-processor.test.ts
```
Expected: FAIL — the thrown error has no `.code` property (it is a plain `Error`).

- [ ] **Step 3: Fix the throw**

In `apps/worker/src/processors/crew-report.ts`, find the unknown-tool throw inside `buildCrewReportRequest` (~line 94):

```ts
  if (!isCrewReportTool(tool)) {
    throw new Error(`Unknown crew report tool: ${String(tool)}`);
  }
```

Replace with:

```ts
  if (!isCrewReportTool(tool)) {
    // Validation-coded so the worker's terminal-status mapper treats this as
    // 'permanent' (an unknown tool will never become valid on retry).
    throw validationCrewReportError(`Unknown crew report tool: ${String(tool)}`);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @seovista/worker test -- src/__tests__/crew-report-processor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/crew-report.ts apps/worker/src/__tests__/crew-report-processor.test.ts
git commit -m "fix(crew-report): validation-coded unknown-tool error (M1b)

buildCrewReportRequest now throws validationCrewReportError for an unknown
tool so the worker maps it to 'permanent' instead of retryable 'failed'."
```

---

## Task 5: M2 — crew-report-worker handler extraction + tests

**Files:**
- Modify: `apps/worker/src/queue/crew-report-worker.ts`
- Create: `apps/worker/src/__tests__/crew-report-worker.test.ts`

**Interfaces:**
- Produces: `processCrewReportJob(data, deps)` and `CrewReportJobDeps` exported from `crew-report-worker.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/worker/src/__tests__/crew-report-worker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  processCrewReportJob,
  type CrewReportDb,
} from "../queue/crew-report-worker.js";
import { CrewAgencyError, type CrewAgencyClient } from "../utils/crew-agency-client.js";
import { CREW_REPORT_JOB_RECORD_QUEUE_NAME } from "../queue/crew-report-submission.js";

/** Minimal DB contract used by the extracted handler and its fake. */
type TestDbRow = Record<string, unknown>;

/** Builds a fake db whose `query` returns rows queued by SQL-substring match. */
function makeFakeDb(
  responses: Array<{ match: string; rows: TestDbRow[] }>,
): { db: CrewReportDb; calls: Array<{ text: string; params?: readonly unknown[] }> } {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const queue = [...responses];
  const db: CrewReportDb = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      const idx = queue.findIndex((r) => text.includes(r.match));
      if (idx === -1) return { rows: [] };
      const { rows } = queue.splice(idx, 1)[0]!;
      return { rows };
    }) as CrewReportDb["query"],
  };
  return { db, calls };
}

function makeFakeClient(overrides: Partial<CrewAgencyClient> = {}): CrewAgencyClient {
  return {
    kickoff: vi.fn(async () => ({ jobId: "crew-job-1" })),
    getJob: vi.fn(async () => ({ status: "completed", result: "# Report\ncontent" })),
    ...overrides,
  } as unknown as CrewAgencyClient;
}

const instantSleep = vi.fn(async () => undefined);

const baseData = { jobId: "job-1", sourceJobId: "src-1", tool: "geo-readiness" as const };

/** Standard source-payload + job-record responses for a happy path. */
function happyPathResponses() {
  return [
    {
      match: "JOIN job_results r",
      rows: [{ payload: { score: 50 }, source_target: "https://example.com" }],
    },
    {
      match: "SELECT job_identity, correlation_id",
      rows: [{ job_identity: "id-1", correlation_id: "corr-1" }],
    },
    { match: "INSERT INTO job_results", rows: [{ id: "result-1" }] },
  ];
}

describe("processCrewReportJob", () => {
  it("happy path: saves result and marks job completed", async () => {
    const { db, calls } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient();

    await processCrewReportJob(baseData, { db, client, sleep: instantSleep });

    // running update
    expect(calls.some((c) => c.text.includes("status = 'running'"))).toBe(true);
    // source join
    expect(calls.some((c) => c.text.includes("JOIN job_results r"))).toBe(true);
    // result insert
    expect(calls.some((c) => c.text.includes("INSERT INTO job_results"))).toBe(true);
    // completed update with result_id
    const completed = calls.find((c) => c.text.includes("status = 'completed'"));
    expect(completed).toBeDefined();
    expect(completed?.params).toContain("result-1");
  });

  it("maps misconfigured CrewAgency to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
    ]);
    // No client passed + resolveCrewAgencyClient returns null — but we inject
    // a null client to simulate misconfiguration directly.
    await expect(
      processCrewReportJob(baseData, { db, client: null, sleep: instantSleep }),
    ).rejects.toThrow();
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps unknown tool to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
    ]);
    const client = makeFakeClient();
    await expect(
      processCrewReportJob(
        { jobId: "job-1", sourceJobId: "src-1", tool: "bogus" as never },
        { db, client, sleep: instantSleep },
      ),
    ).rejects.toThrow(/Unknown crew report tool/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps missing source payload to permanent", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [] }, // no source row
    ]);
    const client = makeFakeClient();
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(/Source payload not found/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("permanent");
  });

  it("maps a failed CrewAgency job to failed", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "failed", error: "boom" })) as never,
    });
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(/CrewAgency job.*failed/);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("failed");
  });

  it("maps poll ceiling to timeout", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "running" })) as never, // never terminal
    });
    await expect(
      processCrewReportJob(baseData, {
        db,
        client,
        sleep: instantSleep,
        pollCeilingMs: 0, // immediately exceeds ceiling
      }),
    ).rejects.toThrow(CrewAgencyError);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("timeout");
  });

  it("extracts markdown from a plain string result", async () => {
    const { db } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result: "plain markdown body" })) as never,
    });
    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
  });

  it.each([
    ["markdown", { markdown: "# via markdown" }],
    ["reportMarkdown", { reportMarkdown: "# via reportMarkdown" }],
    ["report", { report: "# via report" }],
  ])("extracts markdown from {%s} key", async (_key, result) => {
    const { db } = makeFakeDb(happyPathResponses());
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result })) as never,
    });
    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
  });

  it("maps empty/whitespace result to crew.unavailable → timeout", async () => {
    const { db, calls } = makeFakeDb([
      { match: "status = 'running'", rows: [] },
      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
    ]);
    const client = makeFakeClient({
      getJob: vi.fn(async () => ({ status: "completed", result: "   " })) as never,
    });
    await expect(
      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
    ).rejects.toThrow(CrewAgencyError);
    const terminal = calls.find((c) => c.text.includes("status = $2"));
    expect(terminal?.params).toContain("timeout");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-worker.test.ts
```
Expected: FAIL — `processCrewReportJob` is not exported.

- [ ] **Step 3: Extract the handler in crew-report-worker.ts**

In `apps/worker/src/queue/crew-report-worker.ts`, extract the BullMQ processor callback into a new exported function `processCrewReportJob`. The `startCrewReportWorker` function keeps the `Worker` construction, env reads, `parseRedisUrl`, and `resolveCrewAgencyClient`/`options` wiring, and delegates its job callback to `processCrewReportJob` with the resolved deps.

Add the new types and function. Place the `CrewReportJobDeps` interface and `processCrewReportJob` function above `startCrewReportWorker`:

```ts
export interface CrewReportDb {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: readonly Record<string, unknown>[] }>;
}

export interface CrewReportJobDeps {
  db: CrewReportDb;
  client: CrewAgencyClient | null;
  sleep: (ms: number) => Promise<void>;
  /** Poll ceiling override; defaults to the module POLL_CEILING_MS (10 min). */
  pollCeilingMs?: number;
  /** Poll interval override; defaults to the module POLL_INTERVAL_MS (5 s). */
  pollIntervalMs?: number;
}

/**
 * Pure job-processing logic extracted from the BullMQ Worker callback so it
 * can be unit-tested with a fake db, mock client, and instant sleep. The
 * terminal-status mapping (catch block) lives here so every error path is
 * testable. `startCrewReportWorker` is thin wiring that resolves deps from
 * env/options and delegates here.
 */
export async function processCrewReportJob(
  data: { jobId: string; sourceJobId: string; tool: CrewReportTool },
  deps: CrewReportJobDeps,
): Promise<void> {
  const { jobId, sourceJobId, tool } = data;
  const { db, client, sleep } = deps;
  const pollCeilingMs = deps.pollCeilingMs ?? POLL_CEILING_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;

  try {
    await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

    // Fail closed when CrewAgency is not configured: a null client maps to a
    // permanent 'crew.misconfigured' failure (no retry can fix configuration).
    if (!client) {
      throw new CrewAgencyError(
        "crew.misconfigured",
        "CrewAgency is not configured: CREW_AGENCY_API_URL and CREW_AGENCY_API_KEY must both be set",
      );
    }

    const sourceQueueName = TOOL_QUEUE_NAMES[tool];
    if (!sourceQueueName) {
      throw permanentCrewReportError(
        `Unknown crew report tool '${String(tool)}' on job ${jobId}`,
      );
    }

    const sourceRes = await db.query(
      `SELECT r.payload, j.target AS source_target FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1`,
      [sourceJobId, sourceQueueName]
    );
    const sourceRow = sourceRes.rows[0];
    if (!sourceRow) {
      throw permanentCrewReportError(
        `Source payload not found for crew report job ${jobId}: no ${sourceQueueName} result for source job ${sourceJobId}`,
      );
    }

    const request = buildCrewReportRequest({
      tool,
      sourcePayload: sourceRow.payload,
      sourceTarget:
        typeof sourceRow.source_target === "string" ? sourceRow.source_target : undefined,
    });
    const { jobId: crewJobId } = await client.kickoff(request.endpoint, request.body);

    const crewStatus = await pollCrewJobUntilTerminal(client, crewJobId, sleep, pollCeilingMs, pollIntervalMs);

    if (crewStatus.status === "failed") {
      throw new Error(
        `CrewAgency job ${crewJobId} failed: ${crewStatus.error ?? "no error detail returned"}`,
      );
    }

    const reportMarkdown = extractReportMarkdown(crewStatus.result);
    if (!reportMarkdown) {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency job ${crewJobId} completed without markdown report content`,
      );
    }

    const result = buildCrewReportResultPayload({
      sourceJobId,
      tool,
      endpoint: request.endpoint,
      reportMarkdown,
      crewJobId,
    });

    const jobRecordRes = await db.query(
      `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
      [jobId, CREW_REPORT_JOB_RECORD_QUEUE_NAME]
    );
    const rawJobRecord = jobRecordRes.rows[0];
    if (!rawJobRecord) {
      throw new Error(`Job record ${jobId} not found during result saving.`);
    }
    const { job_identity, correlation_id } = rawJobRecord;

    const jobResultRes = await db.query(
      `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
       VALUES ($1, $2, 'crew-report:result', $3) RETURNING id`,
      [correlation_id, job_identity, JSON.stringify(result)]
    );
    const rawResultRes = jobResultRes.rows[0];
    if (!rawResultRes) {
      throw new Error(`Failed to return result ID after crew report job save.`);
    }

    const resultId = rawResultRes.id;

    await db.query(
      `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, resultId]
    );
  } catch (err) {
    console.error("Crew report worker failed job:", err);
    let terminalStatus = 'failed';

    if (err instanceof CrewAgencyError) {
      if (
        err.code === "crew.auth" ||
        err.code === "crew.misconfigured" ||
        err.code === "crew.client_error"
      ) {
        terminalStatus = 'permanent';
      } else {
        terminalStatus = 'timeout';
      }
    } else if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = err.code;
      if (typeof code === 'string' && code.startsWith('validation.')) {
        terminalStatus = 'permanent';
      }
    }

    await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
    throw err;
  }
}
```

Update `pollCrewJobUntilTerminal` to accept the ceiling and interval as parameters:

```ts
async function pollCrewJobUntilTerminal(
  client: CrewAgencyClient,
  crewJobId: string,
  sleep: (ms: number) => Promise<void>,
  pollCeilingMs: number = POLL_CEILING_MS,
  pollIntervalMs: number = POLL_INTERVAL_MS,
): Promise<CrewJobStatus> {
  const startedAt = Date.now();
  for (;;) {
    const status = await client.getJob(crewJobId);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    if (Date.now() - startedAt >= pollCeilingMs) {
      throw new CrewAgencyError(
        "crew.timeout",
        `CrewAgency job ${crewJobId} did not reach a terminal state within ${pollCeilingMs}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}
```

Update `startCrewReportWorker`'s `Worker` callback to delegate to `processCrewReportJob`. Replace the entire `async (job: Job) => { ... }` callback body with:

```ts
    async (job: Job) => {
      const { jobId, sourceJobId, tool } = job.data as {
        jobId: string;
        sourceJobId: string;
        tool: CrewReportTool;
      };

      const client = options?.client ?? resolveCrewAgencyClient();
      const sleep = options?.sleep ?? defaultSleep;
      await processCrewReportJob(
        { jobId, sourceJobId, tool },
        { db, client, sleep },
      );
    },
```

The null-client guard belongs inside `processCrewReportJob` (shown above), where it maps `crew.misconfigured` to the permanent terminal status and is directly covered by the unit test. The BullMQ callback only resolves the client and delegates to the handler, so it does not duplicate the guard. The `console` import at the top of the file (`import console from "node:console"`) stays because `console.error` in the handler catch and worker close callback are allowed by the ESLint config.

- [ ] **Step 4: Run the test to verify it passes**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test -- src/__tests__/crew-report-worker.test.ts
```
Expected: PASS — all 9 test groups green (the markdown-key table is one group with three parameterized cases). If a test fails due to the fake db `query` matching logic, adjust the `match` substrings to align with the actual SQL text (the SQL strings are visible in `processCrewReportJob`).

- [ ] **Step 5: Run the full worker suite**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test
```
Expected: PASS — all existing tests green, plus the new handler coverage. Known env failures (geo-worker 429, Crew Agency notify, migration-invariants) acceptable.

- [ ] **Step 6: Typecheck and lint**

Run:
```powershell
pnpm --filter @seovista/worker typecheck
pnpm --filter @seovista/worker lint
```
Expected: 0 errors, 0 errors (lint warnings from M5 are addressed in Task 6).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/queue/crew-report-worker.ts apps/worker/src/__tests__/crew-report-worker.test.ts
git commit -m "test(crew-report-worker): extract handler + cover terminal mapping (M2)

Extract processCrewReportJob(data, deps) with injected db/client/sleep.
startCrewReportWorker is thin wiring. New test covers happy path,
misconfigured/unknown-tool/missing-source → permanent, crew failed → failed,
poll ceiling → timeout, and extractReportMarkdown variants."
```

---

## Task 6: M5 — logger injection

**Files:**
- Create: `apps/worker/src/utils/logger.ts`
- Modify: `apps/worker/src/db/admin-seed.ts`
- Modify: `apps/worker/src/db/dev-seed.ts`
- Modify: `apps/worker/src/utils/fetcher.ts`

**Interfaces:**
- Produces: `Logger` type, `stdoutLogger`, `noopLogger` from `apps/worker/src/utils/logger.ts`

- [ ] **Step 1: Create the logger utility**

Create `apps/worker/src/utils/logger.ts`:

```ts
/**
 * Injected logger contract for CLI scripts and worker diagnostics.
 *
 * The ESLint `no-console` rule (`allow: ["error", "warn"]`) flags every
 * `console.log` call site. Instead of scattering `eslint-disable` comments,
 * every call site injects a `Logger` and the single sanctioned `console.log`
 * lives here in {@link stdoutLogger}. Tests inject {@link noopLogger} or a
 * `vi.fn()` to assert/suppress output.
 */
export type Logger = (...values: unknown[]) => void;

// eslint-disable-next-line no-console -- single sanctioned stdout wrapper; all
// other call sites inject a Logger so the no-console rule stays clean.
export const stdoutLogger: Logger = (...values) => {
  console.log(...values);
};

export const noopLogger: Logger = () => {};
```

- [ ] **Step 2: Update admin-seed.ts default logger**

In `apps/worker/src/db/admin-seed.ts`:

1. Add the import (near the top, after the existing imports):

```ts
import { stdoutLogger, type Logger } from "../utils/logger.js";
```

2. Change the `logger` type in `LocalAdminBootstrapDependencies` from `logger?: (...values: unknown[]) => void;` to:

```ts
  logger?: Logger;
```

3. Change the default at ~line 124:

```ts
  const logger = dependencies.logger ?? stdoutLogger;
```

- [ ] **Step 3: Update dev-seed.ts**

In `apps/worker/src/db/dev-seed.ts`:

1. Add the import after the existing imports:

```ts
import { stdoutLogger, type Logger } from "../utils/logger.js";
```

2. Change the `main` function signature to accept a logger:

```ts
async function main(logger: Logger = stdoutLogger) {
```

3. Replace every `console.log(...)` call inside `main` with `logger(...)`. There are 11 occurrences:
   - `console.log(\`Connecting to database at ${connectionString}...\`);` → `logger(\`Connecting to database at ${connectionString}...\`);`
   - `console.log("Database connection successful.");` → `logger("Database connection successful.");`
   - `console.log(\`Inserted admin: ${adminEmail}\`);` → `logger(\`Inserted admin: ${adminEmail}\`);`
   - `console.log(\`Admin ${adminEmail} already exists. Skipping.\`);` → `logger(\`Admin ${adminEmail} already exists. Skipping.\`);`
   - `console.log(\`Inserted published insight: ${insight.slug}\`);` → `logger(\`Inserted published insight: ${insight.slug}\`);`
   - `console.log(\`Insight ${insight.slug} already exists. Skipping.\`);` → `logger(\`Insight ${insight.slug} already exists. Skipping.\`);`
   - `console.log(\`Inserted finished lead: ${finishedLead.domain}\`);` → `logger(\`Inserted finished lead: ${finishedLead.domain}\`);`
   - `console.log(\`Finished lead completed-lead.local already exists. Skipping.\`);` → `logger(\`Finished lead completed-lead.local already exists. Skipping.\`);`
   - `console.log(\`Inserted abandoned lead: ${abandonedLead.domain}\`);` → `logger(\`Inserted abandoned lead: ${abandonedLead.domain}\`);`
   - `console.log(\`Abandoned lead abandoned-lead.local already exists. Skipping.\`);` → `logger(\`Abandoned lead abandoned-lead.local already exists. Skipping.\`);`
   - `console.log("Seeding complete.");` → `logger("Seeding complete.");`

4. Leave the two `console.error` calls in the `catch`/`finally` and the bottom `main().catch` as-is (allowed by the ESLint config).

- [ ] **Step 4: Update fetcher.ts**

In `apps/worker/src/utils/fetcher.ts`:

1. Add the import after the existing imports (near the top, after `import { getDailyCreditStatus } from "./credit-guard.js";`):

```ts
import { stdoutLogger, type Logger } from "./logger.js";
```

2. Add `logger` to the `FetchAndParseUrlOptions` interface:

```ts
export interface FetchAndParseUrlOptions {
  forceAudit?: boolean;
  /** Injected stdout logger; defaults to the sanctioned stdoutLogger. */
  logger?: Logger;
}
```

3. Inside `fetchAndParseUrlWithMeta`, resolve the logger from options near the top of the function (after `const forceAudit = ...`):

```ts
  const logger = options.logger ?? stdoutLogger;
```

4. Replace the two `console.log(...)` calls with `logger(...)`:
   - The `render_cache_hit` JSON event (~line 700): `console.log(JSON.stringify({...}))` → `logger(JSON.stringify({...}))`
   - The `render_cache_miss` JSON event (~line 748): `console.log(JSON.stringify({...}))` → `logger(JSON.stringify({...}))`

5. Leave all `console.warn(...)` calls as-is (allowed by the ESLint config).

- [ ] **Step 5: Run lint to verify 0 warnings**

Run: `pnpm --filter @seovista/worker lint`
Expected: 0 errors, **0 warnings** (down from 14 `no-console` warnings). If any warning remains, find the remaining `console.log` call site and route it through the logger.

- [ ] **Step 6: Run worker tests to verify behavior is preserved**

Run (with lifecycle context):
```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker test
```
Expected: PASS — the `admin-bootstrap.test.ts` suite (which injects its own `logger`) stays green; no test relied on `console.log` being called directly.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @seovista/worker typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/utils/logger.ts apps/worker/src/db/admin-seed.ts apps/worker/src/db/dev-seed.ts apps/worker/src/utils/fetcher.ts
git commit -m "refactor(worker): inject logger, remove 14 no-console warnings (M5)

Add utils/logger.ts (stdoutLogger + noopLogger). admin-seed/dev-seed/fetcher
inject a Logger instead of calling console.log directly. Behavior preserved;
worker lint now reports 0 warnings."
```

---

## Final Gate (whole batch)

After all 6 tasks are committed and per-task reviewed:

- [ ] **Full web suite:** `pnpm --filter @seovista/web test` — green
- [ ] **Full worker suite:** with lifecycle context, `pnpm --filter @seovista/worker test` — green (known env failures acceptable)
- [ ] **seo-core suite:** `pnpm --filter @seovista/seo-core test` — green
- [ ] **geo-engine suite:** `pnpm --filter @seovista/geo-engine test` — green
- [ ] **Typecheck both:** `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/worker typecheck` — 0 errors
- [ ] **Lint both:** `pnpm --filter @seovista/web lint` and `pnpm --filter @seovista/worker lint` — 0 errors, 0 warnings
- [ ] **If worker types changed (Task 5):** `pnpm --filter @seovista/worker build` before web typecheck
- [ ] **Final whole-batch review** over the full diff (base `07fb5cb`, head = last task commit)
- [ ] **Close-out:** append a Debt Batch section to `.superpowers/sdd/progress.md` with per-task commit SHAs and review verdicts
