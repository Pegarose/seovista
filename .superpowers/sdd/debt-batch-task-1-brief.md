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


