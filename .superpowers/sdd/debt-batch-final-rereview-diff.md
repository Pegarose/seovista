BASE: fad260a
HEAD: 9805ce5

COMMITS:
9805ce5 fix(worker): map invalid CrewAgency config permanently
5aa87e5 refactor(worker): inject logger, remove 14 no-console warnings (M5)
af9be3b test(crew-report-worker): extract handler + cover terminal mapping (M2)
1bc50ac fix(crew-report): validation-coded unknown-tool error (M1b)
d4d71d6 refactor: dedup conflict-detector (M1a)
5718ae3 test(seo-core): cover robots parser edge cases (B8)
7224626 fix(geo-checker): complete ISSUE_TRANSLATIONS parity with geo-engine codes

STAT:
 .../__tests__/issue-translations.test.ts           |  28 ++
 .../components/geo-checker/issue-translations.ts   |  87 ++++++
 .../src/components/geo-checker/score-breakdown.tsx |  75 +----
 .../src/__tests__/crew-report-processor.test.ts    |  20 +-
 .../src/__tests__/crew-report-worker.test.ts       | 207 ++++++++++++++
 apps/worker/src/db/admin-seed.ts                   |   5 +-
 apps/worker/src/db/dev-seed.ts                     |  25 +-
 apps/worker/src/processors/ai-crawler-audit.ts     |  33 +--
 apps/worker/src/processors/crew-report.ts          |   4 +-
 apps/worker/src/queue/crew-report-worker.ts        | 306 ++++++++++++---------
 apps/worker/src/utils/fetcher.ts                   |   8 +-
 apps/worker/src/utils/logger.ts                    |  17 ++
 packages/seo-core/src/__tests__/robots.test.ts     |  92 +++++++
 packages/seo-core/src/index.ts                     |   1 +
 packages/seo-core/src/robots.ts                    |  13 +-
 15 files changed, 666 insertions(+), 255 deletions(-)

FIX DIFF:
diff --git a/apps/worker/src/__tests__/crew-report-worker.test.ts b/apps/worker/src/__tests__/crew-report-worker.test.ts
index 52d3428..85bbccd 100644
--- a/apps/worker/src/__tests__/crew-report-worker.test.ts
+++ b/apps/worker/src/__tests__/crew-report-worker.test.ts
@@ -1,15 +1,16 @@
 import { describe, expect, it, vi } from "vitest";
 import {
   processCrewReportJob,
+  resolveCrewReportClient,
   type CrewReportDb,
 } from "../queue/crew-report-worker.js";
 import { CrewAgencyError, type CrewAgencyClient } from "../utils/crew-agency-client.js";
 
 /** Minimal DB contract used by the extracted handler and its fake. */
 type TestDbRow = Record<string, unknown>;
 
 /** Builds a fake db whose `query` returns rows queued by SQL-substring match. */
 function makeFakeDb(
   responses: Array<{ match: string; rows: TestDbRow[] }>,
 ): { db: CrewReportDb; calls: Array<{ text: string; params?: readonly unknown[] }> } {
   const calls: Array<{ text: string; params?: readonly unknown[] }> = [];
@@ -71,33 +72,50 @@ describe("processCrewReportJob", () => {
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
-    // No client passed + resolveCrewAgencyClient returns null — but we inject
+    // No client passed + resolveCrewReportClient returns null — but we inject
     // a null client to simulate misconfiguration directly.
     await expect(
       processCrewReportJob(baseData, { db, client: null, sleep: instantSleep }),
     ).rejects.toThrow();
     const terminal = calls.find((c) => c.text.includes("status = $2"));
     expect(terminal?.params).toContain("permanent");
   });
 
+  it("normalizes an invalid configured URL before handler mapping", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+    ]);
+    const client = resolveCrewReportClient({
+      CREW_AGENCY_API_URL: "not-a-url",
+      CREW_AGENCY_API_KEY: "test-key",
+    });
+
+    expect(client).toBeNull();
+    await expect(
+      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
+    ).rejects.toMatchObject({ code: "crew.misconfigured" });
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("permanent");
+  });
+
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
diff --git a/apps/worker/src/queue/crew-report-worker.ts b/apps/worker/src/queue/crew-report-worker.ts
index f0a2a28..40170d5 100644
--- a/apps/worker/src/queue/crew-report-worker.ts
+++ b/apps/worker/src/queue/crew-report-worker.ts
@@ -88,24 +88,42 @@ export interface CrewReportDb {
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
 
+/**
+ * Resolves the configured CrewAgency client for the worker wiring. Invalid
+ * operator configuration is normalized to null so the handler's single
+ * terminal-status mapping path records crew.misconfigured as permanent.
+ */
+export function resolveCrewReportClient(
+  env: { CREW_AGENCY_API_URL?: string | undefined; CREW_AGENCY_API_KEY?: string | undefined } = process.env,
+): CrewAgencyClient | null {
+  try {
+    return resolveCrewAgencyClient(env);
+  } catch (err) {
+    if (err instanceof CrewAgencyError && err.code === "crew.misconfigured") {
+      return null;
+    }
+    throw err;
+  }
+}
+
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
@@ -236,25 +254,25 @@ export function startCrewReportWorker(options?: CrewReportWorkerOptions) {
 
   const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
 
   const worker = new Worker(
     options?.queueName ?? process.env.CREW_REPORT_QUEUE_NAME ?? CREW_REPORT_QUEUE_NAME,
     async (job: Job) => {
       const { jobId, sourceJobId, tool } = job.data as {
         jobId: string;
         sourceJobId: string;
         tool: CrewReportTool;
       };
 
-      const client = options?.client ?? resolveCrewAgencyClient();
+      const client = options?.client ?? resolveCrewReportClient();
       const sleep = options?.sleep ?? defaultSleep;
       await processCrewReportJob(
         { jobId, sourceJobId, tool },
         { db, client, sleep },
       );
     },
     { connection, autorun: true, concurrency: getCrewReportWorkerConcurrency(options) }
   );
 
   // Close db client when worker closes to avoid hanging connection
   worker.on('closed', () => {
     db.close().catch(console.error);

FULL DIFF:
diff --git a/apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts b/apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts
new file mode 100644
index 0000000..d3928d2
--- /dev/null
+++ b/apps/web/src/components/geo-checker/__tests__/issue-translations.test.ts
@@ -0,0 +1,28 @@
+import { describe, expect, it } from "vitest";
+import { CODE_TO_TAGS } from "@seovista/geo-engine";
+import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "../issue-translations";
+
+describe("ISSUE_TRANSLATIONS parity with geo-engine", () => {
+  it("every CODE_TO_TAGS key has a non-empty Turkish translation", () => {
+    const engineCodes = Object.keys(CODE_TO_TAGS);
+    const dictCodes = Object.keys(ISSUE_TRANSLATIONS);
+    const missing = engineCodes.filter((code) => !dictCodes.includes(code));
+    expect(missing, `Missing translations for: ${missing.join(", ")}`).toEqual([]);
+  });
+
+  it("every translation value is a non-empty trimmed string", () => {
+    for (const [code, value] of Object.entries(ISSUE_TRANSLATIONS)) {
+      expect(typeof value, `${code} value type`).toBe("string");
+      expect(value.trim().length, `${code} value must be non-empty`).toBeGreaterThan(0);
+    }
+  });
+});
+
+describe("MODULE_STATUS_LABEL", () => {
+  it("covers all status bands with non-empty Turkish labels", () => {
+    const bands = ["excellent", "good", "needs_improvement", "poor", "critical"] as const;
+    for (const band of bands) {
+      expect(MODULE_STATUS_LABEL[band].trim().length).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/apps/web/src/components/geo-checker/issue-translations.ts b/apps/web/src/components/geo-checker/issue-translations.ts
new file mode 100644
index 0000000..5118f28
--- /dev/null
+++ b/apps/web/src/components/geo-checker/issue-translations.ts
@@ -0,0 +1,87 @@
+import type { ScoreBreakdownModule } from "@seovista/geo-engine";
+
+/**
+ * Render-friendly Turkish status labels for a scoring module's `status` band.
+ *
+ * The numeric `score` / `maxScore` is always rendered alongside the label so
+ * the band is never communicated by color or label alone — keyboard and
+ * screen-reader users see the concrete numbers. Labels mirror the
+ * confidence-labeling convention (Turkish-default per master PRD §0.3).
+ */
+export const MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string> = {
+  excellent: "Mükemmel",
+  good: "İyi",
+  needs_improvement: "Geliştirilmeli",
+  poor: "Zayıf",
+  critical: "Kritik",
+};
+
+/**
+ * Türkçe sorun açıklamaları sözlüğü.
+ *
+ * Coverage invariant: every issue `code` the geo-engine can emit (i.e. every
+ * key of `CODE_TO_TAGS` in `packages/geo-engine/src/issue-tags.ts`) MUST have
+ * an entry here. The companion test `issue-translations.test.ts` enforces this
+ * so a future engine code never silently falls back to the English
+ * `AuditIssue.title` in the Turkish UI.
+ */
+export const ISSUE_TRANSLATIONS: Record<string, string> = {
+  ANSWER_BLOCK_OPPORTUNITY: "İçerikte net soru-cevap veya FAQ blokları eksik.",
+  CITATION_READINESS_WEAK: "Yetkili dış kaynaklara atıf ve bağlantı sayısı sınırlı.",
+  AI_PARSEABILITY_RISK: "Yapılandırılmış liste veya tablo biçimlendirmesi bulunamadı.",
+  ENTITY_CLARITY_WEAK: "Ana konu kavramları ve varlık tanımları açıkça belirtilmemiş.",
+  THIRD_PARTY_MENTION_DATA_UNAVAILABLE: "Üçüncü taraf marka anılma verisi henüz entegre edilmedi.",
+  PLATFORM_READINESS_LIMITED: "Yapay zeka platformlarında alıntılanma hazırığı sınırlı.",
+  LOW_STRUCTURE_QUALITY: "İçerik yapısı zayıf (Alt başlıklar eksik).",
+  NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC: "Karmaşık konular için liste veya tablo kullanımı bulunmuyor.",
+  THIN_CONTENT_RISK: "Yetersiz / sığ içerik tespiti.",
+  INTRO_MISSING_OR_WEAK: "Ana konu giriş paragrafında yer almıyor.",
+  KEYWORD_STUFFING_RISK: "Aşırı anahtar kelime kullanımı riski.",
+  CONTENT_INTENT_MISMATCH_RISK: "Arama amacı ve sayfa tipi uyumsuzluğu.",
+  HTTPS_MISSING: "Güvenli HTTPS bağlantısı eksik.",
+  HTML_SIZE_LARGE: "HTML dosya boyutu çok yüksek.",
+  DOM_SIZE_LARGE: "DOM düğüm sayısı yüksek.",
+  HTTP_5XX_DETECTED: "Sunucu hatası (HTTP 5xx) tespit edildi.",
+  HTTP_4XX_DETECTED: "Sayfa bulunamadı veya erişim hatası (HTTP 4xx).",
+  HTTP_STATUS_NOT_OK: "Sayfa 200 OK yerine beklenmeyen bir HTTP durum kodu döndürüyor.",
+  NOINDEX_DETECTED: "Sayfa noindex etiketi içeriyor.",
+  NOFOLLOW_DETECTED: "Sayfa nofollow etiketi içeriyor.",
+  CANONICAL_MISSING: "Canonical URL etiketi eksik.",
+  CANONICAL_DOMAIN_MISMATCH: "Canonical etiketinde alan adı uyumsuzluğu.",
+  CANONICAL_NON_SELF_REFERENCING: "Canonical etiketi kendini işaret etmiyor.",
+  CSR_RENDER_RISK: "İçerik yalnızca istemci tarafında (JS) oluşturuluyor.",
+  STATIC_HTML_CONTENT_MISSING: "Statik HTML içinde metin içeriği bulunamadı.",
+  MAIN_CONTENT_EMPTY: "Ana içerik alanı boş görünüyor.",
+  NO_INTERNAL_LINKS: "Sayfada iç bağlantı bulunmuyor.",
+  GENERIC_ANCHOR_TEXT: "Genel / belirsiz bağlantı metinleri kullanılmış.",
+  EMPTY_ANCHOR_TEXT: "Metinsiz boş bağlantılar tespit edildi.",
+  EXCESSIVE_EXTERNAL_LINKS: "Aşırı sayıda dış bağlantı mevcut.",
+  TARGET_KEYWORD_NOT_IN_TITLE: "Hedef konu title etiketinde yer almıyor.",
+  TARGET_KEYWORD_NOT_IN_H1: "Hedef konu H1 başlığında bulunmuyor.",
+  TARGET_KEYWORD_NOT_IN_INTRO: "Hedef konu ilk içerik paragrafında yer almıyor.",
+  LOW_SEMANTIC_COVERAGE: "Ana konunun içerikteki anlamsal kapsamı sınırlı.",
+  SEMANTIC_GAP_DETECTED: "Ana konu içerikte bulunamadı.",
+  HEADING_COVERAGE_WEAK: "Alt başlıklar ana konuyu yeterince yansıtmıyor.",
+  INFORMATION_GAIN_OPPORTUNITY: "İçerik ek alt konularla zenginleştirilebilir.",
+  PRIMARY_TOPIC_UNCLEAR: "Sayfanın ana konusu anlaşılamadı.",
+  TOPIC_INFERENCE_LOW_CONFIDENCE: "Ana konu düşük güvenle çıkarıldı.",
+  TARGET_KEYWORD_NOT_PROVIDED: "Hedef anahtar kelime girilmedi — anlamsal analiz genel konu bazlı çalıştırıldı.",
+  TITLE_MISSING: "Sayfa başlığı (Title tag) eksik.",
+  TITLE_TOO_SHORT: "Sayfa başlığı çok kısa.",
+  TITLE_TOO_LONG: "Sayfa başlığı çok uzun.",
+  META_DESCRIPTION_MISSING: "Meta açıklama (Meta description) eksik.",
+  META_DESCRIPTION_TOO_SHORT: "Meta açıklama çok kısa.",
+  META_DESCRIPTION_TOO_LONG: "Meta açıklama çok uzun.",
+  H1_MISSING: "H1 başlığı eksik.",
+  MULTIPLE_H1: "Birden fazla H1 başlığı kullanılmış.",
+  OPEN_GRAPH_INCOMPLETE: "Open Graph sosyal medya etiketleri eksik.",
+  TWITTER_CARD_INCOMPLETE: "Twitter Card etiketleri eksik.",
+  JSON_LD_INVALID: "Geçersiz JSON-LD yapısal verisi.",
+  BREADCRUMB_SCHEMA_MISSING: "Breadcrumb yapısal verisi eksik.",
+  JSON_LD_MISSING_RECOMMENDED_SCHEMA: "Önerilen schema yapısal verileri eksik.",
+  PAGESPEED_PROVIDER_FAILED: "Sayfa hızı verisi alınamadı (PageSpeed API hatası).",
+  PAGESPEED_SKIPPED: "Sayfa hızı (Core Web Vitals) bu analizde ölçülmedi.",
+  SEMANTIC_LSI_GAP: "İçerikte rakip sayfalarda bulunan anlamsal (LSI) terimler eksik.",
+  SEMANTIC_ENTITY_GAP: "İçerikte konuyla ilişkili önemli varlıklar (entity) eksik.",
+  SEMANTIC_ENRICHMENT_UNAVAILABLE: "Anlamsal zenginleştirme verisi bu analizde alınamadı; skor etkilenmedi.",
+};
diff --git a/apps/web/src/components/geo-checker/score-breakdown.tsx b/apps/web/src/components/geo-checker/score-breakdown.tsx
index 90b298f..6afb9ab 100644
--- a/apps/web/src/components/geo-checker/score-breakdown.tsx
+++ b/apps/web/src/components/geo-checker/score-breakdown.tsx
@@ -1,83 +1,12 @@
 import type { ReactElement } from "react";
-import type { ScoreBreakdown, ScoreBreakdownModule } from "@seovista/geo-engine";
+import type { ScoreBreakdown } from "@seovista/geo-engine";
 import { PlatformConfidenceView } from "./platform-confidence";
-
-/**
- * Render-friendly Turkish status labels for a scoring module's `status` band.
- *
- * The numeric `score` / `maxScore` is always rendered alongside the label so
- * the band is never communicated by color or label alone — keyboard and
- * screen-reader users see the concrete numbers. Labels mirror the
- * confidence-labeling convention (Turkish-default per master PRD §0.3).
- */
-const MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string> = {
-  excellent: "Mükemmel",
-  good: "İyi",
-  needs_improvement: "Geliştirilmeli",
-  poor: "Zayıf",
-  critical: "Kritik",
-};
-
-/** Türkçe sorun açıklamaları sözlüğü */
-const ISSUE_TRANSLATIONS: Record<string, string> = {
-  ANSWER_BLOCK_OPPORTUNITY: "İçerikte net soru-cevap veya FAQ blokları eksik.",
-  CITATION_READINESS_WEAK: "Yetkili dış kaynaklara atıf ve bağlantı sayısı sınırlı.",
-  AI_PARSEABILITY_RISK: "Yapılandırılmış liste veya tablo biçimlendirmesi bulunamadı.",
-  ENTITY_CLARITY_WEAK: "Ana konu kavramları ve varlık tanımları açıkça belirtilmemiş.",
-  THIRD_PARTY_MENTION_DATA_UNAVAILABLE: "Üçüncü taraf marka anılma verisi henüz entegre edilmedi.",
-  PLATFORM_READINESS_LIMITED: "Yapay zeka platformlarında alıntılanma hazırığı sınırlı.",
-  LOW_STRUCTURE_QUALITY: "İçerik yapısı zayıf (Alt başlıklar eksik).",
-  NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC: "Karmaşık konular için liste veya tablo kullanımı bulunmuyor.",
-  THIN_CONTENT_RISK: "Yetersiz / sığ içerik tespiti.",
-  INTRO_MISSING_OR_WEAK: "Ana konu giriş paragrafında yer almıyor.",
-  KEYWORD_STUFFING_RISK: "Aşırı anahtar kelime kullanımı riski.",
-  CONTENT_INTENT_MISMATCH_RISK: "Arama amacı ve sayfa tipi uyumsuzluğu.",
-  HTTPS_MISSING: "Güvenli HTTPS bağlantısı eksik.",
-  HTML_SIZE_LARGE: "HTML dosya boyutu çok yüksek.",
-  DOM_SIZE_LARGE: "DOM düğüm sayısı yüksek.",
-  HTTP_5XX_DETECTED: "Sunucu hatası (HTTP 5xx) tespit edildi.",
-  HTTP_4XX_DETECTED: "Sayfa bulunamadı veya erişim hatası (HTTP 4xx).",
-  NOINDEX_DETECTED: "Sayfa noindex etiketi içeriyor.",
-  NOFOLLOW_DETECTED: "Sayfa nofollow etiketi içeriyor.",
-  CANONICAL_MISSING: "Canonical URL etiketi eksik.",
-  CANONICAL_DOMAIN_MISMATCH: "Canonical etiketinde alan adı uyumsuzluğu.",
-  CANONICAL_NON_SELF_REFERENCING: "Canonical etiketi kendini işaret etmiyor.",
-  CSR_RENDER_RISK: "İçerik yalnızca istemci tarafında (JS) oluşturuluyor.",
-  STATIC_HTML_CONTENT_MISSING: "Statik HTML içinde metin içeriği bulunamadı.",
-  MAIN_CONTENT_EMPTY: "Ana içerik alanı boş görünüyor.",
-  NO_INTERNAL_LINKS: "Sayfada iç bağlantı bulunmuyor.",
-  GENERIC_ANCHOR_TEXT: "Genel / belirsiz bağlantı metinleri kullanılmış.",
-  EMPTY_ANCHOR_TEXT: "Metinsiz boş bağlantılar tespit edildi.",
-  EXCESSIVE_EXTERNAL_LINKS: "Aşırı sayıda dış bağlantı mevcut.",
-  TARGET_KEYWORD_NOT_IN_TITLE: "Hedef konu title etiketinde yer almıyor.",
-  TARGET_KEYWORD_NOT_IN_H1: "Hedef konu H1 başlığında bulunmuyor.",
-  TARGET_KEYWORD_NOT_IN_INTRO: "Hedef konu ilk içerik paragrafında yer almıyor.",
-  LOW_SEMANTIC_COVERAGE: "Ana konunun içerikteki anlamsal kapsamı sınırlı.",
-  SEMANTIC_GAP_DETECTED: "Ana konu içerikte bulunamadı.",
-  HEADING_COVERAGE_WEAK: "Alt başlıklar ana konuyu yeterince yansıtmıyor.",
-  INFORMATION_GAIN_OPPORTUNITY: "İçerik ek alt konularla zenginleştirilebilir.",
-  PRIMARY_TOPIC_UNCLEAR: "Sayfanın ana konusu anlaşılamadı.",
-  TOPIC_INFERENCE_LOW_CONFIDENCE: "Ana konu düşük güvenle çıkarıldı.",
-  TARGET_KEYWORD_NOT_PROVIDED: "Hedef anahtar kelime girilmedi — anlamsal analiz genel konu bazlı çalıştırıldı.",
-  TITLE_MISSING: "Sayfa başlığı (Title tag) eksik.",
-  TITLE_TOO_SHORT: "Sayfa başlığı çok kısa.",
-  TITLE_TOO_LONG: "Sayfa başlığı çok uzun.",
-  META_DESCRIPTION_MISSING: "Meta açıklama (Meta description) eksik.",
-  META_DESCRIPTION_TOO_SHORT: "Meta açıklama çok kısa.",
-  META_DESCRIPTION_TOO_LONG: "Meta açıklama çok uzun.",
-  H1_MISSING: "H1 başlığı eksik.",
-  MULTIPLE_H1: "Birden fazla H1 başlığı kullanılmış.",
-  OPEN_GRAPH_INCOMPLETE: "Open Graph sosyal medya etiketleri eksik.",
-  TWITTER_CARD_INCOMPLETE: "Twitter Card etiketleri eksik.",
-  JSON_LD_INVALID: "Geçersiz JSON-LD yapısal verisi.",
-  BREADCRUMB_SCHEMA_MISSING: "Breadcrumb yapısal verisi eksik.",
-  JSON_LD_MISSING_RECOMMENDED_SCHEMA: "Önerilen schema yapısal verileri eksik.",
-};
+import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "./issue-translations";
 
 /**
  * Severity glyph used for the per-issue point-loss badge. Deliberately a
  * text + icon pattern (not color-only) so colour-blind users can distinguish
  * a deducting issue from an info-only nudge. The badge is only rendered when
  * `pointLoss < 0` — info-only issues (pointLoss 0) show no badge to avoid
  * visual noise like "−0 puan".
  */
diff --git a/apps/worker/src/__tests__/crew-report-processor.test.ts b/apps/worker/src/__tests__/crew-report-processor.test.ts
index d3483ad..b461730 100644
--- a/apps/worker/src/__tests__/crew-report-processor.test.ts
+++ b/apps/worker/src/__tests__/crew-report-processor.test.ts
@@ -198,20 +198,34 @@ describe("buildCrewReportRequest", () => {
       },
     });
 
     const body = request.body as { raw_data_context: string };
     expect(body.raw_data_context.length).toBeLessThanOrEqual(4000);
     expect(body.raw_data_context.endsWith("…")).toBe(true);
   });
 
-  it("throws for an unknown tool", () => {
+  it("buildCrewReportRequest throws a validation-coded error for an unknown tool", () => {
     expect(() =>
-      buildCrewReportRequest({ tool: "unknown-tool" as never, sourcePayload: {} }),
-    ).toThrow(/unknown/i);
+      buildCrewReportRequest({
+        tool: "bogus" as never,
+        sourcePayload: {},
+        sourceTarget: undefined,
+      }),
+    ).toThrow(/Unknown crew report tool/);
+
+    try {
+      buildCrewReportRequest({
+        tool: "bogus" as never,
+        sourcePayload: {},
+        sourceTarget: undefined,
+      });
+    } catch (err) {
+      expect((err as Error & { code?: string }).code).toBe("validation.crew_report");
+    }
   });
 });
 
 describe("buildCrewReportResultPayload", () => {
   it("builds the persisted crew-report payload without a score", () => {
     const payload = buildCrewReportResultPayload({
       sourceJobId: "source-job-1",
       tool: "geo-readiness",
diff --git a/apps/worker/src/__tests__/crew-report-worker.test.ts b/apps/worker/src/__tests__/crew-report-worker.test.ts
new file mode 100644
index 0000000..85bbccd
--- /dev/null
+++ b/apps/worker/src/__tests__/crew-report-worker.test.ts
@@ -0,0 +1,207 @@
+import { describe, expect, it, vi } from "vitest";
+import {
+  processCrewReportJob,
+  resolveCrewReportClient,
+  type CrewReportDb,
+} from "../queue/crew-report-worker.js";
+import { CrewAgencyError, type CrewAgencyClient } from "../utils/crew-agency-client.js";
+
+/** Minimal DB contract used by the extracted handler and its fake. */
+type TestDbRow = Record<string, unknown>;
+
+/** Builds a fake db whose `query` returns rows queued by SQL-substring match. */
+function makeFakeDb(
+  responses: Array<{ match: string; rows: TestDbRow[] }>,
+): { db: CrewReportDb; calls: Array<{ text: string; params?: readonly unknown[] }> } {
+  const calls: Array<{ text: string; params?: readonly unknown[] }> = [];
+  const queue = [...responses];
+  const db: CrewReportDb = {
+    query: vi.fn(async (text: string, params?: unknown[]) => {
+      if (params) {
+        calls.push({ text, params });
+      } else {
+        calls.push({ text });
+      }
+      const idx = queue.findIndex((r) => text.includes(r.match));
+      if (idx === -1) return { rows: [] };
+      const { rows } = queue.splice(idx, 1)[0]!;
+      return { rows };
+    }) as CrewReportDb["query"],
+  };
+  return { db, calls };
+}
+
+function makeFakeClient(overrides: Partial<CrewAgencyClient> = {}): CrewAgencyClient {
+  return {
+    kickoff: vi.fn(async () => ({ jobId: "crew-job-1" })),
+    getJob: vi.fn(async () => ({ status: "completed", result: "# Report\ncontent" })),
+    ...overrides,
+  } as unknown as CrewAgencyClient;
+}
+
+const instantSleep = vi.fn(async () => undefined);
+
+const baseData = { jobId: "job-1", sourceJobId: "src-1", tool: "geo-readiness" as const };
+
+/** Standard source-payload + job-record responses for a happy path. */
+function happyPathResponses() {
+  return [
+    {
+      match: "JOIN job_results r",
+      rows: [{ payload: { score: 50 }, source_target: "https://example.com" }],
+    },
+    {
+      match: "SELECT job_identity, correlation_id",
+      rows: [{ job_identity: "id-1", correlation_id: "corr-1" }],
+    },
+    { match: "INSERT INTO job_results", rows: [{ id: "result-1" }] },
+  ];
+}
+
+describe("processCrewReportJob", () => {
+  it("happy path: saves result and marks job completed", async () => {
+    const { db, calls } = makeFakeDb(happyPathResponses());
+    const client = makeFakeClient();
+
+    await processCrewReportJob(baseData, { db, client, sleep: instantSleep });
+
+    // running update
+    expect(calls.some((c) => c.text.includes("status = 'running'"))).toBe(true);
+    // source join
+    expect(calls.some((c) => c.text.includes("JOIN job_results r"))).toBe(true);
+    // result insert
+    expect(calls.some((c) => c.text.includes("INSERT INTO job_results"))).toBe(true);
+    // completed update with result_id
+    const completed = calls.find((c) => c.text.includes("status = 'completed'"));
+    expect(completed).toBeDefined();
+    expect(completed?.params).toContain("result-1");
+  });
+
+  it("maps misconfigured CrewAgency to permanent", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+    ]);
+    // No client passed + resolveCrewReportClient returns null — but we inject
+    // a null client to simulate misconfiguration directly.
+    await expect(
+      processCrewReportJob(baseData, { db, client: null, sleep: instantSleep }),
+    ).rejects.toThrow();
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("permanent");
+  });
+
+  it("normalizes an invalid configured URL before handler mapping", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+    ]);
+    const client = resolveCrewReportClient({
+      CREW_AGENCY_API_URL: "not-a-url",
+      CREW_AGENCY_API_KEY: "test-key",
+    });
+
+    expect(client).toBeNull();
+    await expect(
+      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
+    ).rejects.toMatchObject({ code: "crew.misconfigured" });
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("permanent");
+  });
+
+  it("maps unknown tool to permanent", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+    ]);
+    const client = makeFakeClient();
+    await expect(
+      processCrewReportJob(
+        { jobId: "job-1", sourceJobId: "src-1", tool: "bogus" as never },
+        { db, client, sleep: instantSleep },
+      ),
+    ).rejects.toThrow(/Unknown crew report tool/);
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("permanent");
+  });
+
+  it("maps missing source payload to permanent", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+      { match: "JOIN job_results r", rows: [] }, // no source row
+    ]);
+    const client = makeFakeClient();
+    await expect(
+      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
+    ).rejects.toThrow(/Source payload not found/);
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("permanent");
+  });
+
+  it("maps a failed CrewAgency job to failed", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
+    ]);
+    const client = makeFakeClient({
+      getJob: vi.fn(async () => ({ status: "failed", error: "boom" })) as never,
+    });
+    await expect(
+      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
+    ).rejects.toThrow(/CrewAgency job.*failed/);
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("failed");
+  });
+
+  it("maps poll ceiling to timeout", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
+    ]);
+    const client = makeFakeClient({
+      getJob: vi.fn(async () => ({ status: "running" })) as never, // never terminal
+    });
+    await expect(
+      processCrewReportJob(baseData, {
+        db,
+        client,
+        sleep: instantSleep,
+        pollCeilingMs: 0, // immediately exceeds ceiling
+      }),
+    ).rejects.toThrow(CrewAgencyError);
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("timeout");
+  });
+
+  it("extracts markdown from a plain string result", async () => {
+    const { db } = makeFakeDb(happyPathResponses());
+    const client = makeFakeClient({
+      getJob: vi.fn(async () => ({ status: "completed", result: "plain markdown body" })) as never,
+    });
+    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
+  });
+
+  it.each([
+    ["markdown", { markdown: "# via markdown" }],
+    ["reportMarkdown", { reportMarkdown: "# via reportMarkdown" }],
+    ["report", { report: "# via report" }],
+  ])("extracts markdown from {%s} key", async (_key, result) => {
+    const { db } = makeFakeDb(happyPathResponses());
+    const client = makeFakeClient({
+      getJob: vi.fn(async () => ({ status: "completed", result })) as never,
+    });
+    await expect(processCrewReportJob(baseData, { db, client, sleep: instantSleep })).resolves.toBeUndefined();
+  });
+
+  it("maps empty/whitespace result to crew.unavailable → timeout", async () => {
+    const { db, calls } = makeFakeDb([
+      { match: "status = 'running'", rows: [] },
+      { match: "JOIN job_results r", rows: [{ payload: {}, source_target: "x" }] },
+    ]);
+    const client = makeFakeClient({
+      getJob: vi.fn(async () => ({ status: "completed", result: "   " })) as never,
+    });
+    await expect(
+      processCrewReportJob(baseData, { db, client, sleep: instantSleep }),
+    ).rejects.toThrow(CrewAgencyError);
+    const terminal = calls.find((c) => c.text.includes("status = $2"));
+    expect(terminal?.params).toContain("timeout");
+  });
+});
diff --git a/apps/worker/src/db/admin-seed.ts b/apps/worker/src/db/admin-seed.ts
index 287856b..80fed55 100644
--- a/apps/worker/src/db/admin-seed.ts
+++ b/apps/worker/src/db/admin-seed.ts
@@ -1,11 +1,12 @@
 import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
 import { createDbClient, type DbClient } from "./client.js";
 import { createMigrationRunner, defaultMigrationsDir, type Migration } from "./migrations.js";
+import { stdoutLogger, type Logger } from "../utils/logger.js";
 
 export const DEFAULT_ADMIN_EMAIL = "admin@seovista.local";
 export const DEFAULT_ADMIN_DISPLAY_NAME = "SeoVista Local Operator";
 
 export interface AdminBootstrapResult {
   id: string;
   email: string;
   display_name: string;
@@ -20,17 +21,17 @@ export interface LocalAdminBootstrapEnvironment {
   DATABASE_URL?: string;
   SEOVISTA_ADMIN_PASSWORD?: string;
 }
 
 export interface LocalAdminBootstrapDependencies {
   createClient?: (options: { connectionString: string; max: number }) => DbClient;
   applyMigrations?: (client: DbClient) => Promise<Migration[]>;
   ensureAdmin?: (client: DbClient, password: string) => Promise<AdminBootstrapIdentity>;
-  logger?: (...values: unknown[]) => void;
+  logger?: Logger;
 }
 
 export interface LocalAdminBootstrapResult {
   status: "skipped" | "created";
   admin?: AdminBootstrapIdentity;
 }
 
 function createAdminPasswordHash(password: string): string {
@@ -116,17 +117,17 @@ export async function runLocalAdminBootstrap(
   if (!password?.trim()) return { status: "skipped" };
 
   const connectionString = assertLocalBootstrapTarget(environment);
   const createClient = dependencies.createClient ?? ((options) => createDbClient(options));
   const client = createClient({ connectionString, max: 5 });
   const applyMigrations = dependencies.applyMigrations ?? ((db) =>
     createMigrationRunner(db, defaultMigrationsDir()).applyAll());
   const ensureAdmin = dependencies.ensureAdmin ?? ensureAdminBootstrap;
-  const logger = dependencies.logger ?? console.log;
+  const logger = dependencies.logger ?? stdoutLogger;
 
   try {
     const appliedMigrations = await applyMigrations(client);
     const admin = await ensureAdmin(client, password);
     logger("Local admin bootstrap completed", {
       adminId: admin.id,
       appliedMigrations: appliedMigrations.length,
     });
diff --git a/apps/worker/src/db/dev-seed.ts b/apps/worker/src/db/dev-seed.ts
index 576acfe..40a251e 100644
--- a/apps/worker/src/db/dev-seed.ts
+++ b/apps/worker/src/db/dev-seed.ts
@@ -1,42 +1,43 @@
 import { createDbClient } from "./client.js";
 import { createAdminAuthRepository } from "./admin-auth.js";
 import { createCmsRepository } from "./cms-repository.js";
 import { createGeoAuditRepository } from "./geo-audit-repository.js";
+import { stdoutLogger, type Logger } from "../utils/logger.js";
 
-async function main() {
+async function main(logger: Logger = stdoutLogger) {
   const connectionString = 
     process.env.DATABASE_URL || "postgresql://seovista:seovista@127.0.0.1:8543/seovista";
 
-  console.log(`Connecting to database at ${connectionString}...`);
+  logger(`Connecting to database at ${connectionString}...`);
   const dbClient = createDbClient({ connectionString });
 
   try {
     // 1. connection check
     await dbClient.query("SELECT 1");
-    console.log("Database connection successful.");
+    logger("Database connection successful.");
 
     const adminRepo = createAdminAuthRepository(dbClient);
     const cmsRepo = createCmsRepository(dbClient);
     const geoRepo = createGeoAuditRepository(dbClient);
 
     // 4. Admin
     const adminEmail = "admin@seovista.example";
     const existingAdmin = await adminRepo.findUserByEmail(adminEmail);
     if (!existingAdmin) {
       await adminRepo.createUser({
         email: adminEmail,
         displayName: "Admin",
         passwordHash: "admin123", // Assuming fake unhashed for dev seeding based on requirements
         status: "active"
       });
-      console.log(`Inserted admin: ${adminEmail}`);
+      logger(`Inserted admin: ${adminEmail}`);
     } else {
-      console.log(`Admin ${adminEmail} already exists. Skipping.`);
+      logger(`Admin ${adminEmail} already exists. Skipping.`);
     }
 
     // 5. Insights - checking existence by slug
     const insights = [
       {
         title: "The Mechanics of AI Visibility",
         slug: "mechanics-of-ai-visibility",
         blocks: [{ type: "paragraph", data: { text: "AI visibility relies on structured and verifiable data citations..." } }]
@@ -68,52 +69,52 @@ async function main() {
             title: insight.title,
             body: insight.blocks
           },
           content_checksum: 'dev-seed-checksum',
           created_by: 'dev-seed'
         });
 
         await cmsRepo.updatePublicationState(entry.id, 'published', revision.id);
-        console.log(`Inserted published insight: ${insight.slug}`);
+        logger(`Inserted published insight: ${insight.slug}`);
       } else {
-        console.log(`Insight ${insight.slug} already exists. Skipping.`);
+        logger(`Insight ${insight.slug} already exists. Skipping.`);
       }
     }
 
     // 6. Leads
     const existingLeads = await geoRepo.getAllLeadsForAdmin();
     
     // Finished Lead
     if (!existingLeads.some(l => l.domain === 'completed-lead.local')) {
       const finishedLead = await geoRepo.createLead({
         domain: "completed-lead.local",
         brandName: "Completed Brand",
         primaryMarket: "US"
       });
       await dbClient.query('UPDATE geo_audit_leads SET work_email = $1, marketing_consent = $2 WHERE id = $3', ["lead@completed-lead.local", true, finishedLead.id]);
-      console.log(`Inserted finished lead: ${finishedLead.domain}`);
+      logger(`Inserted finished lead: ${finishedLead.domain}`);
     } else {
-      console.log(`Finished lead completed-lead.local already exists. Skipping.`);
+      logger(`Finished lead completed-lead.local already exists. Skipping.`);
     }
 
     // Abandoned Halfway Lead
     if (!existingLeads.some(l => l.domain === 'abandoned-lead.local')) {
       const abandonedLead = await geoRepo.createLead({
         domain: "abandoned-lead.local",
         brandName: "Abandoned Brand",
         primaryMarket: "US"
       });
       // No email update
-      console.log(`Inserted abandoned lead: ${abandonedLead.domain}`);
+      logger(`Inserted abandoned lead: ${abandonedLead.domain}`);
     } else {
-       console.log(`Abandoned lead abandoned-lead.local already exists. Skipping.`);
+       logger(`Abandoned lead abandoned-lead.local already exists. Skipping.`);
     }
 
-    console.log("Seeding complete.");
+    logger("Seeding complete.");
 
   } catch (err) {
     console.error("Seeding failed:", err);
   } finally {
     await dbClient.close();
   }
 }
 
diff --git a/apps/worker/src/processors/ai-crawler-audit.ts b/apps/worker/src/processors/ai-crawler-audit.ts
index 1115b42..0e175a6 100644
--- a/apps/worker/src/processors/ai-crawler-audit.ts
+++ b/apps/worker/src/processors/ai-crawler-audit.ts
@@ -1,15 +1,15 @@
 import {
+  detectContradictoryRuleConflicts,
   detectRuleConflicts,
   evaluateAllCrawlers,
   parseRobotsTxt,
   type CrawlerCategory,
   type CrawlerAccessStatus,
-  type RobotsTxtDocument,
   type RuleConflict,
 } from "@seovista/seo-core";
 
 export interface AiCrawlerAuditResultPayload {
   readonly score: number;
   readonly robotsTxtFound: boolean;
   readonly robotsTxtUrl: string;
   readonly sitemaps: readonly string[];
@@ -25,54 +25,25 @@ export interface AiCrawlerAuditResultPayload {
 }
 
 const BLOCK_PENALTY_SEARCH = 12;
 const CONFLICT_PENALTY = 8;
 const CONFLICT_PENALTY_CAP = 24;
 const MISSING_ROBOTS_CAP = 60;
 const MISSING_SITEMAP_PENALTY = 5;
 
-/**
- * Detects genuine rule contradictions: the same path carrying both an Allow
- * and a Disallow rule inside one group.
- *
- * Deliberately NOT counted here: the `detectRuleConflicts` notices about a
- * user-agent-specific full block while the wildcard group stays open. Those
- * describe intentional per-bot policies (e.g. `GPTBot: Disallow /`), not
- * misconfigurations — the PRD honesty rules state that blocking AI training
- * bots is a legitimate policy choice and must never be scored or surfaced as
- * a defect, so only true Allow/Disallow contradictions carry a penalty.
- */
-function findContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
-  const conflicts: RuleConflict[] = [];
-  for (const group of doc.groups) {
-    const allows = new Set(
-      group.rules.filter((r) => r.type === "allow").map((r) => r.pattern),
-    );
-    for (const rule of group.rules) {
-      if (rule.type === "disallow" && allows.has(rule.pattern)) {
-        conflicts.push({
-          description: `Aynı yol için hem Allow hem Disallow kuralı tanımlı: ${rule.pattern}`,
-          lines: [`user-agent: ${group.userAgents.join(", ")} (satır ${group.line})`],
-        });
-      }
-    }
-  }
-  return conflicts;
-}
-
 export function processAiCrawlerAuditPayload(
   robotsTxtContent: string | null,
   robotsTxtUrl: string,
 ): AiCrawlerAuditResultPayload {
   const found = robotsTxtContent !== null;
   const doc = parseRobotsTxt(robotsTxtContent ?? "");
   const crawlers = evaluateAllCrawlers(doc);
   const conflicts = found ? detectRuleConflicts(doc) : [];
-  const contradictoryConflicts = found ? findContradictoryRuleConflicts(doc) : [];
+  const contradictoryConflicts = found ? detectContradictoryRuleConflicts(doc) : [];
   const recommendations: string[] = [];
 
   let penalty = 0;
   for (const crawler of crawlers) {
     if (crawler.status === "blocked" && crawler.category !== "ai-training") {
       penalty += BLOCK_PENALTY_SEARCH;
       if (crawler.category === "search") {
         recommendations.push(
diff --git a/apps/worker/src/processors/crew-report.ts b/apps/worker/src/processors/crew-report.ts
index cb855b4..d9563f9 100644
--- a/apps/worker/src/processors/crew-report.ts
+++ b/apps/worker/src/processors/crew-report.ts
@@ -86,17 +86,19 @@ export interface CrewReportRequest {
  * map to `/api/rapor-uret` with the live contract `{ rapor_konusu,
  * raw_data_context, brand_context?, dil }`. Unknown tools throw — the worker
  * maps that to a permanent failure.
  */
 export function buildCrewReportRequest(input: BuildCrewReportRequestInput): CrewReportRequest {
   const { tool, sourcePayload, sourceTarget } = input;
 
   if (!isCrewReportTool(tool)) {
-    throw new Error(`Unknown crew report tool: ${String(tool)}`);
+    // Validation-coded so the worker's terminal-status mapper treats this as
+    // 'permanent' (an unknown tool will never become valid on retry).
+    throw validationCrewReportError(`Unknown crew report tool: ${String(tool)}`);
   }
 
   const record = isRecord(sourcePayload) ? sourcePayload : {};
 
   if (tool === "keyword-rank") {
     const keyword = pickString(record, ["keyword"]);
     const domain = pickString(record, ["domain"]);
     if (!keyword || !domain) {
diff --git a/apps/worker/src/queue/crew-report-worker.ts b/apps/worker/src/queue/crew-report-worker.ts
index b99179f..40170d5 100644
--- a/apps/worker/src/queue/crew-report-worker.ts
+++ b/apps/worker/src/queue/crew-report-worker.ts
@@ -75,16 +75,181 @@ export function getCrewReportWorkerConcurrency(options?: CrewReportWorkerOptions
   }
   const envConcurrency = Number(env.CREW_REPORT_WORKER_CONCURRENCY);
   if (envConcurrency > 0) {
     return envConcurrency;
   }
   return 3;
 }
 
+export interface CrewReportDb {
+  query(
+    sql: string,
+    params?: unknown[],
+  ): Promise<{ rows: readonly Record<string, unknown>[] }>;
+}
+
+export interface CrewReportJobDeps {
+  db: CrewReportDb;
+  client: CrewAgencyClient | null;
+  sleep: (ms: number) => Promise<void>;
+  /** Poll ceiling override; defaults to the module POLL_CEILING_MS (10 min). */
+  pollCeilingMs?: number;
+  /** Poll interval override; defaults to the module POLL_INTERVAL_MS (5 s). */
+  pollIntervalMs?: number;
+}
+
+/**
+ * Resolves the configured CrewAgency client for the worker wiring. Invalid
+ * operator configuration is normalized to null so the handler's single
+ * terminal-status mapping path records crew.misconfigured as permanent.
+ */
+export function resolveCrewReportClient(
+  env: { CREW_AGENCY_API_URL?: string | undefined; CREW_AGENCY_API_KEY?: string | undefined } = process.env,
+): CrewAgencyClient | null {
+  try {
+    return resolveCrewAgencyClient(env);
+  } catch (err) {
+    if (err instanceof CrewAgencyError && err.code === "crew.misconfigured") {
+      return null;
+    }
+    throw err;
+  }
+}
+
+/**
+ * Pure job-processing logic extracted from the BullMQ Worker callback so it
+ * can be unit-tested with a fake db, mock client, and instant sleep. The
+ * terminal-status mapping (catch block) lives here so every error path is
+ * testable. `startCrewReportWorker` is thin wiring that resolves deps from
+ * env/options and delegates here.
+ */
+export async function processCrewReportJob(
+  data: { jobId: string; sourceJobId: string; tool: CrewReportTool },
+  deps: CrewReportJobDeps,
+): Promise<void> {
+  const { jobId, sourceJobId, tool } = data;
+  const { db, client, sleep } = deps;
+  const pollCeilingMs = deps.pollCeilingMs ?? POLL_CEILING_MS;
+  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
+
+  try {
+    await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);
+
+    // Fail closed when CrewAgency is not configured: a null client maps to a
+    // permanent 'crew.misconfigured' failure (no retry can fix configuration).
+    if (!client) {
+      throw new CrewAgencyError(
+        "crew.misconfigured",
+        "CrewAgency is not configured: CREW_AGENCY_API_URL and CREW_AGENCY_API_KEY must both be set",
+      );
+    }
+
+    const sourceQueueName = TOOL_QUEUE_NAMES[tool];
+    if (!sourceQueueName) {
+      throw permanentCrewReportError(
+        `Unknown crew report tool '${String(tool)}' on job ${jobId}`,
+      );
+    }
+
+    const sourceRes = await db.query(
+      `SELECT r.payload, j.target AS source_target FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1`,
+      [sourceJobId, sourceQueueName]
+    );
+    const sourceRow = sourceRes.rows[0];
+    if (!sourceRow) {
+      throw permanentCrewReportError(
+        `Source payload not found for crew report job ${jobId}: no ${sourceQueueName} result for source job ${sourceJobId}`,
+      );
+    }
+
+    const request = buildCrewReportRequest({
+      tool,
+      sourcePayload: sourceRow.payload,
+      sourceTarget:
+        typeof sourceRow.source_target === "string" ? sourceRow.source_target : undefined,
+    });
+    const { jobId: crewJobId } = await client.kickoff(request.endpoint, request.body);
+
+    const crewStatus = await pollCrewJobUntilTerminal(client, crewJobId, sleep, pollCeilingMs, pollIntervalMs);
+
+    if (crewStatus.status === "failed") {
+      throw new Error(
+        `CrewAgency job ${crewJobId} failed: ${crewStatus.error ?? "no error detail returned"}`,
+      );
+    }
+
+    const reportMarkdown = extractReportMarkdown(crewStatus.result);
+    if (!reportMarkdown) {
+      throw new CrewAgencyError(
+        "crew.unavailable",
+        `CrewAgency job ${crewJobId} completed without markdown report content`,
+      );
+    }
+
+    const result = buildCrewReportResultPayload({
+      sourceJobId,
+      tool,
+      endpoint: request.endpoint,
+      reportMarkdown,
+      crewJobId,
+    });
+
+    const jobRecordRes = await db.query(
+      `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
+      [jobId, CREW_REPORT_JOB_RECORD_QUEUE_NAME]
+    );
+    const rawJobRecord = jobRecordRes.rows[0];
+    if (!rawJobRecord) {
+      throw new Error(`Job record ${jobId} not found during result saving.`);
+    }
+    const { job_identity, correlation_id } = rawJobRecord;
+
+    const jobResultRes = await db.query(
+      `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
+       VALUES ($1, $2, 'crew-report:result', $3) RETURNING id`,
+      [correlation_id, job_identity, JSON.stringify(result)]
+    );
+    const rawResultRes = jobResultRes.rows[0];
+    if (!rawResultRes) {
+      throw new Error(`Failed to return result ID after crew report job save.`);
+    }
+
+    const resultId = rawResultRes.id;
+
+    await db.query(
+      `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
+      [jobId, resultId]
+    );
+  } catch (err) {
+    console.error("Crew report worker failed job:", err);
+    let terminalStatus = 'failed';
+
+    if (err instanceof CrewAgencyError) {
+      if (
+        err.code === "crew.auth" ||
+        err.code === "crew.misconfigured" ||
+        err.code === "crew.client_error"
+      ) {
+        terminalStatus = 'permanent';
+      } else {
+        terminalStatus = 'timeout';
+      }
+    } else if (typeof err === 'object' && err !== null && 'code' in err) {
+      const code = err.code;
+      if (typeof code === 'string' && code.startsWith('validation.')) {
+        terminalStatus = 'permanent';
+      }
+    }
+
+    await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
+    throw err;
+  }
+}
+
 export function startCrewReportWorker(options?: CrewReportWorkerOptions) {
   const connection = parseRedisUrl(process.env.REDIS_URL);
 
   if (!process.env.DATABASE_URL) {
     throw new Error("DATABASE_URL is required to start crew report worker");
   }
 
   const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
@@ -93,143 +258,22 @@ export function startCrewReportWorker(options?: CrewReportWorkerOptions) {
     options?.queueName ?? process.env.CREW_REPORT_QUEUE_NAME ?? CREW_REPORT_QUEUE_NAME,
     async (job: Job) => {
       const { jobId, sourceJobId, tool } = job.data as {
         jobId: string;
         sourceJobId: string;
         tool: CrewReportTool;
       };
 
-      try {
-        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);
-
-        // Fail closed when CrewAgency is not configured: the web action gates
-        // on the same envs, but a job can still reach the worker (direct
-        // enqueue, env drift) — permanent, no retry can fix configuration.
-        const client = options?.client ?? resolveCrewAgencyClient();
-        if (!client) {
-          throw new CrewAgencyError(
-            "crew.misconfigured",
-            "CrewAgency is not configured: CREW_AGENCY_API_URL and CREW_AGENCY_API_KEY must both be set",
-          );
-        }
-
-        const sourceQueueName = TOOL_QUEUE_NAMES[tool];
-        if (!sourceQueueName) {
-          throw permanentCrewReportError(
-            `Unknown crew report tool '${String(tool)}' on job ${jobId}`,
-          );
-        }
-
-        // Load the source audit payload through the correlation join, scoped
-        // to the queue_name of the chain that produced it (TOOL_QUEUE_NAMES).
-        // j.target is selected alongside the payload: some source payloads
-        // (e.g. the schema audit's SchemaAuditExtractionResult) carry no
-        // url/target field, so the job record's target is threaded through as
-        // the brand_context fallback.
-        const sourceRes = await db.query(
-          `SELECT r.payload, j.target AS source_target FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1`,
-          [sourceJobId, sourceQueueName]
-        );
-        const sourceRow = sourceRes.rows[0];
-        if (!sourceRow) {
-          throw permanentCrewReportError(
-            `Source payload not found for crew report job ${jobId}: no ${sourceQueueName} result for source job ${sourceJobId}`,
-          );
-        }
-
-        const request = buildCrewReportRequest({
-          tool,
-          sourcePayload: sourceRow.payload,
-          sourceTarget:
-            typeof sourceRow.source_target === "string" ? sourceRow.source_target : undefined,
-        });
-        const { jobId: crewJobId } = await client.kickoff(request.endpoint, request.body);
-
-        const sleep = options?.sleep ?? defaultSleep;
-        const crewStatus = await pollCrewJobUntilTerminal(client, crewJobId, sleep);
-
-        if (crewStatus.status === "failed") {
-          throw new Error(
-            `CrewAgency job ${crewJobId} failed: ${crewStatus.error ?? "no error detail returned"}`,
-          );
-        }
-
-        const reportMarkdown = extractReportMarkdown(crewStatus.result);
-        if (!reportMarkdown) {
-          throw new CrewAgencyError(
-            "crew.unavailable",
-            `CrewAgency job ${crewJobId} completed without markdown report content`,
-          );
-        }
-
-        const result = buildCrewReportResultPayload({
-          sourceJobId,
-          tool,
-          endpoint: request.endpoint,
-          reportMarkdown,
-          crewJobId,
-        });
-
-        const jobRecordRes = await db.query(
-          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
-          [jobId, CREW_REPORT_JOB_RECORD_QUEUE_NAME]
-        );
-        const rawJobRecord = jobRecordRes.rows[0];
-        if (!rawJobRecord) {
-          throw new Error(`Job record ${jobId} not found during result saving.`);
-        }
-        const { job_identity, correlation_id } = rawJobRecord;
-
-        const jobResultRes = await db.query(
-          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
-           VALUES ($1, $2, 'crew-report:result', $3) RETURNING id`,
-          [correlation_id, job_identity, JSON.stringify(result)]
-        );
-        const rawResultRes = jobResultRes.rows[0];
-        if (!rawResultRes) {
-          throw new Error(`Failed to return result ID after crew report job save.`);
-        }
-
-        const resultId = rawResultRes.id;
-
-        await db.query(
-          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
-          [jobId, resultId]
-        );
-      } catch (err) {
-        console.error("Crew report worker failed job:", err);
-        // Terminal-status mapping: CrewAgency auth, configuration, and
-        // client-contract failures are permanent (no retry can fix them);
-        // rate limiting, transient unavailability, request timeouts, and the
-        // 10-minute poll ceiling map to 'timeout'; source-payload/tool
-        // validation problems are permanent; everything else is 'failed'.
-        let terminalStatus = 'failed';
-
-        if (err instanceof CrewAgencyError) {
-          if (
-            err.code === "crew.auth" ||
-            err.code === "crew.misconfigured" ||
-            err.code === "crew.client_error"
-          ) {
-            terminalStatus = 'permanent';
-          } else {
-            // crew.timeout, crew.unavailable, crew.rate_limited
-            terminalStatus = 'timeout';
-          }
-        } else if (typeof err === 'object' && err !== null && 'code' in err && typeof (err as any).code === 'string') {
-          const code = (err as any).code as string;
-          if (code.startsWith('validation.')) {
-            terminalStatus = 'permanent';
-          }
-        }
-
-        await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
-        throw err;
-      }
+      const client = options?.client ?? resolveCrewReportClient();
+      const sleep = options?.sleep ?? defaultSleep;
+      await processCrewReportJob(
+        { jobId, sourceJobId, tool },
+        { db, client, sleep },
+      );
     },
     { connection, autorun: true, concurrency: getCrewReportWorkerConcurrency(options) }
   );
 
   // Close db client when worker closes to avoid hanging connection
   worker.on('closed', () => {
     db.close().catch(console.error);
   });
@@ -243,30 +287,32 @@ export function startCrewReportWorker(options?: CrewReportWorkerOptions) {
  * in-flight (the client passes them through verbatim). Hitting the
  * `POLL_CEILING_MS` ceiling throws `crew.timeout` so the job maps to the
  * retryable 'timeout' terminal status instead of hanging forever.
  */
 async function pollCrewJobUntilTerminal(
   client: CrewAgencyClient,
   crewJobId: string,
   sleep: (ms: number) => Promise<void>,
+  pollCeilingMs: number = POLL_CEILING_MS,
+  pollIntervalMs: number = POLL_INTERVAL_MS,
 ): Promise<CrewJobStatus> {
   const startedAt = Date.now();
   for (;;) {
     const status = await client.getJob(crewJobId);
     if (status.status === "completed" || status.status === "failed") {
       return status;
     }
-    if (Date.now() - startedAt >= POLL_CEILING_MS) {
+    if (Date.now() - startedAt >= pollCeilingMs) {
       throw new CrewAgencyError(
         "crew.timeout",
-        `CrewAgency job ${crewJobId} did not reach a terminal state within ${POLL_CEILING_MS}ms`,
+        `CrewAgency job ${crewJobId} did not reach a terminal state within ${pollCeilingMs}ms`,
       );
     }
-    await sleep(POLL_INTERVAL_MS);
+    await sleep(pollIntervalMs);
   }
 }
 
 /**
  * Extracts the markdown report body from a completed CrewAgency job result.
  * Accepts a plain string result or a record carrying the report under
  * `markdown` / `reportMarkdown` / `report`.
  */
diff --git a/apps/worker/src/utils/fetcher.ts b/apps/worker/src/utils/fetcher.ts
index 343f02a..0eb66bc 100644
--- a/apps/worker/src/utils/fetcher.ts
+++ b/apps/worker/src/utils/fetcher.ts
@@ -4,26 +4,29 @@ import ipaddr from "ipaddr.js";
 import { type ParsedPage } from "@seovista/geo-engine";
 import {
   computeCacheKey,
   getCachedRender,
   setCachedRender,
   incrementBrowseractCreditCounter,
 } from "./render-cache.js";
 import { getDailyCreditStatus } from "./credit-guard.js";
+import { stdoutLogger, type Logger } from "./logger.js";
 
 /**
  * Options passed to {@link fetchAndParseUrl}.
  *
  * `forceAudit: true` bypasses the render cache and triggers a fresh render
  * (the fresh result is written back to the cache so subsequent non-forced
  * audits benefit from it). See VAL-A-SPA-002.
  */
 export interface FetchAndParseUrlOptions {
   forceAudit?: boolean;
+  /** Injected stdout logger; defaults to the sanctioned stdoutLogger. */
+  logger?: Logger;
 }
 
 /**
  * Extended fetch result carrying render-cache metadata. `cacheHit` is `true`
  * when the parsed page was served from `geo:cache:{sha256(canonicalUrl)}`
  * without invoking Browseract / Cheerio (VAL-A-SPA-001). Callers that need the
  * cache-hit flag for telemetry (e.g. the `audit_completed` Sentry event,
  * VAL-A-OBS-002) should use {@link fetchAndParseUrlWithMeta}; callers that
@@ -686,23 +689,24 @@ export async function fetchAndParseUrl(
 export async function fetchAndParseUrlWithMeta(
   targetUrl: string,
   options: FetchAndParseUrlOptions = {},
 ): Promise<FetchAndParseUrlResult> {
   // 1. Validate against SSRF
   await validateSSRF(targetUrl);
 
   const forceAudit = options.forceAudit === true;
+  const logger = options.logger ?? stdoutLogger;
   const cacheKey = computeCacheKey(targetUrl);
 
   // 2. Cache lookup (skipped on forceAudit bypass)
   if (!forceAudit) {
     const cached = await getCachedRender(cacheKey);
     if (cached) {
-      console.log(
+      logger(
         JSON.stringify({
           name: "@seovista/worker",
           layer: "fetcher",
           event: "render_cache_hit",
           cache: true,
           cacheKey,
           canonicalUrl: targetUrl,
           timestamp: new Date().toISOString(),
@@ -740,17 +744,17 @@ export async function fetchAndParseUrlWithMeta(
   } else {
     // Under the daily limit → consume a credit and proceed with a fresh
     // render decision. The counter increments once per miss/bypass regardless
     // of whether Browseract ultimately succeeds or falls back to Cheerio
     // (VAL-A-SPA-001 evidence: credit counter increments on miss/bypass).
     await incrementBrowseractCreditCounter();
   }
 
-  console.log(
+  logger(
     JSON.stringify({
       name: "@seovista/worker",
       layer: "fetcher",
       event: "render_cache_miss",
       cache: false,
       forceAudit,
       cacheKey,
       canonicalUrl: targetUrl,
diff --git a/apps/worker/src/utils/logger.ts b/apps/worker/src/utils/logger.ts
new file mode 100644
index 0000000..6227816
--- /dev/null
+++ b/apps/worker/src/utils/logger.ts
@@ -0,0 +1,17 @@
+/**
+ * Injected logger contract for CLI scripts and worker diagnostics.
+ *
+ * The ESLint `no-console` rule (`allow: ["error", "warn"]`) flags every
+ * `console.log` call site. Instead of scattering `eslint-disable` comments,
+ * every call site injects a `Logger` and the single sanctioned `console.log`
+ * lives here in {@link stdoutLogger}. Tests inject {@link noopLogger} or a
+ * `vi.fn()` to assert/suppress output.
+ */
+export type Logger = (...values: unknown[]) => void;
+
+export const stdoutLogger: Logger = (...values) => {
+  // eslint-disable-next-line no-console -- single sanctioned stdout wrapper; all other call sites inject a Logger so the no-console rule stays clean.
+  console.log(...values);
+};
+
+export const noopLogger: Logger = () => {};
diff --git a/packages/seo-core/src/__tests__/robots.test.ts b/packages/seo-core/src/__tests__/robots.test.ts
index dafe825..6e23b65 100644
--- a/packages/seo-core/src/__tests__/robots.test.ts
+++ b/packages/seo-core/src/__tests__/robots.test.ts
@@ -1,11 +1,12 @@
 import { describe, expect, it } from "vitest";
 import {
   detectRuleConflicts,
+  detectContradictoryRuleConflicts,
   evaluateCrawlerAccess,
   isPathAllowed,
   parseRobotsTxt,
 } from "../robots";
 
 const SAMPLE = `
 # comment line
 User-agent: *
@@ -67,8 +68,99 @@ describe("detectRuleConflicts", () => {
     expect(detectRuleConflicts(doc).length).toBe(1);
   });
   it("detects UA-specific full block while wildcard allows", () => {
     const doc = parseRobotsTxt(SAMPLE);
     const conflicts = detectRuleConflicts(doc);
     expect(conflicts.some((c) => c.description.includes("GPTBot".toLowerCase()) || c.description.includes("gptbot"))).toBe(true);
   });
 });
+
+describe("parseRobotsTxt edge cases", () => {
+  it("strips a leading UTF-8 BOM", () => {
+    const doc = parseRobotsTxt("\uFEFFUser-agent: *\nDisallow: /private\n");
+    expect(doc.groups).toHaveLength(1);
+    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+  });
+
+  it("splits CRLF (\\r\\n) line endings", () => {
+    const doc = parseRobotsTxt("User-agent: *\r\nDisallow: /a\r\n");
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
+  });
+
+  it("splits lone CR (\\r) line endings", () => {
+    const doc = parseRobotsTxt("User-agent: *\rDisallow: /a\r");
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/a");
+  });
+
+  it("strips inline # comments on rule lines", () => {
+    const doc = parseRobotsTxt("User-agent: *\nDisallow: /admin # keep out\n");
+    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/admin");
+  });
+
+  it("records a parseError for a line without a colon", () => {
+    const doc = parseRobotsTxt("User-agent: *\nthis-has-no-colon\n");
+    expect(doc.parseErrors.length).toBe(1);
+    expect(doc.parseErrors[0]).toMatch(/geçersiz alan/);
+  });
+
+  it("records a parseError for a rule before any user-agent", () => {
+    const doc = parseRobotsTxt("Disallow: /secret\nUser-agent: *\n");
+    expect(doc.parseErrors.length).toBe(1);
+    expect(doc.parseErrors[0]).toMatch(/user-agent olmadan/);
+  });
+
+  it("treats empty Allow as a no-op (rule not pushed)", () => {
+    const doc = parseRobotsTxt("User-agent: *\nAllow:\nDisallow: /x\n");
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+    expect(doc.groups[0]?.rules[0]?.type).toBe("disallow");
+  });
+
+  it("accumulates multiple User-agent lines into one group", () => {
+    const doc = parseRobotsTxt("User-agent: Googlebot\nUser-agent: GPTBot\nDisallow: /both\n");
+    expect(doc.groups).toHaveLength(1);
+    expect(doc.groups[0]?.userAgents).toEqual(["googlebot", "gptbot"]);
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+  });
+
+  it("is case-insensitive on field names (USER-AGENT)", () => {
+    const doc = parseRobotsTxt("USER-AGENT: *\nDISALLOW: /x\n");
+    expect(doc.groups[0]?.userAgents).toEqual(["*"]);
+    expect(doc.groups[0]?.rules[0]?.pattern).toBe("/x");
+  });
+
+  it("ignores unknown fields (Crawl-delay, Host) without error", () => {
+    const doc = parseRobotsTxt("User-agent: *\nCrawl-delay: 10\nHost: example.com\nDisallow: /x\n");
+    expect(doc.parseErrors).toHaveLength(0);
+    expect(doc.groups[0]?.rules).toHaveLength(1);
+  });
+
+  it("skips an empty Sitemap value", () => {
+    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nSitemap:\n");
+    expect(doc.sitemaps).toHaveLength(0);
+  });
+});
+
+describe("isPathAllowed tie-break", () => {
+  it("allow wins when Allow and Disallow patterns have equal length", () => {
+    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
+    expect(isPathAllowed(doc, "Googlebot", "/x")).toBe(true);
+  });
+});
+
+describe("detectContradictoryRuleConflicts", () => {
+  it("detects same-pattern allow+disallow in one group", () => {
+    const doc = parseRobotsTxt("User-agent: *\nAllow: /x\nDisallow: /x\n");
+    const conflicts = detectContradictoryRuleConflicts(doc);
+    expect(conflicts).toHaveLength(1);
+    expect(conflicts[0]?.description).toContain("/x");
+  });
+
+  it("does NOT report the wildcard-policy-vs-UA-full-block conflict (that stays in detectRuleConflicts)", () => {
+    const doc = parseRobotsTxt("User-agent: *\nDisallow:\nUser-agent: GPTBot\nDisallow: /\n");
+    expect(detectContradictoryRuleConflicts(doc)).toHaveLength(0);
+    // The full detectRuleConflicts DOES report it:
+    expect(detectRuleConflicts(doc).length).toBeGreaterThan(0);
+  });
+});
diff --git a/packages/seo-core/src/index.ts b/packages/seo-core/src/index.ts
index 76c0877..d36c2e7 100644
--- a/packages/seo-core/src/index.ts
+++ b/packages/seo-core/src/index.ts
@@ -62,16 +62,17 @@ export type {
 } from "./robots.js";
 
 export {
   parseRobotsTxt,
   robotsPatternMatches,
   isPathAllowed,
   evaluateCrawlerAccess,
   detectRuleConflicts,
+  detectContradictoryRuleConflicts,
 } from "./robots.js";
 
 export type {
   CrawlerCategory,
   CrawlerDescriptor,
   CrawlerEvaluation,
 } from "./ai-crawlers.js";
 
diff --git a/packages/seo-core/src/robots.ts b/packages/seo-core/src/robots.ts
index 5310b2d..f10f437 100644
--- a/packages/seo-core/src/robots.ts
+++ b/packages/seo-core/src/robots.ts
@@ -126,29 +126,40 @@ export function evaluateCrawlerAccess(doc: RobotsTxtDocument, userAgent: string)
 
 export interface RuleConflict {
   readonly description: string;
   readonly lines: string[];
 }
 
 const FULL_BLOCK_PATTERNS = new Set(["/", "/*"]);
 
-export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
+/**
+ * Detects genuine rule contradictions: the same path carrying both an Allow
+ * and a Disallow rule inside one group. This is the narrow, penalty-relevant
+ * subset of {@link detectRuleConflicts} — the worker's AI-crawler audit uses
+ * it directly so it does not duplicate the logic (M1(a) drift fix).
+ */
+export function detectContradictoryRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
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
+  return conflicts;
+}
+
+export function detectRuleConflicts(doc: RobotsTxtDocument): RuleConflict[] {
+  const conflicts: RuleConflict[] = detectContradictoryRuleConflicts(doc);
   const wildcards = doc.groups.filter((g) => g.userAgents.includes("*"));
   const wildcardFullBlock = wildcards.some((g) =>
     g.rules.some((r) => r.type === "disallow" && FULL_BLOCK_PATTERNS.has(r.pattern)),
   );
   if (wildcards.length > 0 && !wildcardFullBlock) {
     for (const group of doc.groups) {
       if (group.userAgents.includes("*")) continue;
       const fullBlock = group.rules.some(
