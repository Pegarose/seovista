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
