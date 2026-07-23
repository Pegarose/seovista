# SeoVista — 6 Aylık Ürün Yol Haritası (Phase Sequencing)

Bu belge, master PRD'nin devamı olarak okunmalıdır. Master PRD "ne" ve "hangi öncelik" (P0–P4) sorularını yanıtlar; bu belge "ne zaman" ve "hangi sırayla" sorularını yanıtlar. Referans: master PRD §17 Feature Roadmap.

Bağlam: Lansman öncesi. MVP geliştiriliyor. Ana kaldıraçlar: ürün derinliği (skorlama kalitesi, öneri motoru, citation takibi) ve güvenilirlik/ölçek. Ufuk: 6 ay.

Not: `[TO VERIFY]` etiketli tüm rakamlar ve varsayımlar, gerçek baseline veya paydaş girdisiyle doğrulanmalıdır.

---

## Yönlendirici Prensip

Sıralama: Güven → Aksiyon → Kapsam → İzleme. Dört ürün bahsi bu bağımlılık zincirine göre dizilmiştir; hepsine aynı anda başlamak lansman öncesi bir ekip için sürdürülemez.

* Güven, temeldir. Skorun tutarsız veya açıklanamaz olması durumunda diğer üç bahis de çöker.
* Aksiyon (öneri motoru + Crew köprüsü), skor güvenilir olduğunda değer üretir ve lead dönüşümünün gerçekleştiği yerdir.
* Kapsam (yeni platformlar), çekirdek sağlamken genişletilir; erken genişleme belirsizliği yatay çoğaltır.
* İzleme (citation takibi), en güçlü retention kaldıracıdır ama güvenilir baseline ve oturmuş birim ekonomi gerektirir.

---

## Karar Kaydı

Bu yol haritasını şekillendiren üç ürün kararı:

1. Tekrarlanabilirlik, engine seviyesinde ele alınır (yalnız UI değil). Deterministik skorlama çekirdeği, varyans üreten enrichment katmanından (NeuronWriter, SPA render) ayrılır. Ölçülebilir çıkış kriteri: aynı URL 5 kez tarandığında skor varyansı ≤ ±2 puan.
2. Reliability MVP kapsamı minimaldir. Ay 1–2'de yalnızca single-flight request dedupe + günlük kredi tavanı (daily credit guard). Full Redis cache mimarisi (free 24h / Pro 7d) Ay 3–4'e ertelenir — gerçek yük profili doğrulanmadan erken optimizasyon yapılmaz.
3. Platform kapsamı koşullu bir maddeye indirilir. Gemini/Claude/DeepSeek eklemesi, ancak çekirdek 4 platformun (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot) confidence skoru ≥0.85'e ulaşırsa değerlendirilir.

---

## Bahis / Faz Eşleştirme Tablosu

| Bahis | Bu plan (zaman) | Master PRD önceliği | Not |
| --- | --- | --- | --- |
| Skorlama güveni + tekrarlanabilirlik + açıklanabilirlik | Ay 1–2 (Phase A) | Eksik (PRD'de yok) | Yeni bölüm; PRD'ye geri beslenmeli |
| Öneri motoru + Crew köprüsü | Ay 2–3 (Phase B) | P1 | Tag→service eşleştirme PRD'de yok |
| Reliability sertleştirme (full cache, concurrency) | Ay 3–4 (Phase B/C) | P0 | Ürün olarak ertelendi; risk mitigasyonu Ay 1–2'de |
| Citation takibi / monitoring | Ay 5–6 (Phase C) | P2 | Retention bahsi |
| Platform kapsamı (Gemini/Claude/DeepSeek) | Koşullu (Ay 4 sonrası) | P3 | Confidence ≥0.85 kapısına bağlı |

Çakışma notu: Master PRD'de cache + BullMQ concurrency P0'dır. Bu planda ürün gerekçesiyle Ay 3–4'e alınmıştır; ancak lansman öncesi trafik spike riski Ay 1–2'deki hafif mitigasyonla (single-flight + credit guard) kapatılır.

---

## Phase A — Güven Temeli (Ay 1–2)

Amaç: Skoru tekrarlanabilir ve açıklanabilir kılmak. Bu faz tamamlanmadan lead köprüsü inşa edilmez, çünkü tüm dönüşüm bu skorlara dayanır.

### Kapsam

* Deterministik çekirdek ayrımı
  * 7 modülün (Indexability, Technical, Content, Semantic, Experience, Linking, AI Visibility) skor katkısını, varyans üreten dış sinyallerden izole et.
  * NeuronWriter çıktısı (LSI/entity/PAA) skordan çıkarılıp ayrı bir "enrichment" katmanına taşınır; skoru etkilemez, öneriyi zenginleştirir.
* SPA render stabilizasyonu
  * Browseract render çıktısını stabilize et veya snapshot'la; aynı URL için tutarlı ParsedPage garantisi.
  * `[TO VERIFY]` Workflow JSON shape bağımlılığının varyans kaynağı olup olmadığını ölç.
* Açıklanabilirlik UI (skor kırılımı)
  * Kullanıcı 68 gördüğünde modül bazlı kırılım görür: örn. Indexability 18/20, "JSON-LD eksik −2".
  * Issue-to-point-loss eşlemesi her modül için görünür.
* Per-platform confidence etiketleme (ürün kararı)
  * Deneysel (0.6–0.8 confidence) per-platform skorlar, kesin sayı yerine confidence-etiketli gösterilir (örn. "Perplexity readiness: Düşük — deneysel").
  * `[TO VERIFY]` Kesin sayı mı, bantlı/etiketli gösterim mi — tasarım kararı bu fazda kesinleşir.

### Çıkış Kriterleri

* Aynı URL 5 kez tarandığında skor varyansı ≤ ±2 puan.
* Skor kırılımı UI'ı üretimde; her modül puan katkısı ve issue-to-point-loss görünür.
* Per-platform skorlar confidence bağlamıyla gösteriliyor.

### KPI Bağlantısı (master PRD §10.3)

* Repeatability variance (yeni metrik) ≤ ±2 puan.
* Score explanation view rate: sonuç sayfasını görenlerin kırılımı açma oranı `[TO VERIFY: baseline yok]`.

---

## Phase B — Aksiyon ve Crew Köprüsü (Ay 2–4)

Amaç: Teşhisi (skor) reçeteye (öneri) çevirmek ve bu reçeteyi Crew Agency lead dönüşümüne bağlamak. Aynı pencerede reliability sertleştirme başlar.

### B1 — Crew Service Catalog Normalizasyonu (Ay 2–3)

* `[TO VERIFY: Crew catalog format]` Varsayım: katalog bugün tag-tabanlı DEĞİL, serbest metin. Bu doğrulanırsa +2–3 hafta ek iş; tag-tabanlıysa bu tampon geri kazanılır.
* Her hizmet şu şemaya normalize edilir: `{ service_id, name, description, target_issue_tags[], tier, sla }`.
* Örnek: `service_aeo_perplexity` → tags: `["perplexity_low", "entity_clarity_weak", "citation_readiness_gap"]`.
* Bu, Crew ile ortak bir veri işi ve recommendation engine'in ön koşuludur.

### B2 — Recommendation Engine + Tag→Service Eşleştirme (Ay 3)

* Recommendation.issueTags\[\] → catalog üzerinden top-1/top-2 hizmet eşleşmesi.
* Kişiselleştirilmiş CTA: kullanıcının en zayıf platformu/issue'su ile Crew hizmeti eşleştirilir (örn. "Perplexity zayıf → Crew AEO paketi").
* Mevcut generic CTA ("Consult with Crew Agency"), skor kırılımından türeyen kişiselleştirilmiş öneriyle değiştirilir.
* Mevcut `notifyCrewAgency()` webhook payload'u, eşleşen service_id ile zenginleştirilir.

### B3 — Reliability Sertleştirme (Ay 3–4)

* Full Redis cache mimarisi devreye girer: free 24h / Pro 7d TTL `[TO VERIFY: TTL değerleri]`.
* BullMQ concurrency tuning; scrape router.
* Bu, Ay 1–2'deki hafif mitigasyonun (single-flight + credit guard) üzerine inşa edilir.

### Ay 1–2 Risk Mitigasyonu (Phase A ile paralel, erken)

* Single-flight request dedupe: aynı URL'in eşzamanlı isteklerini birleştir (TTL ≤ 1 saat).
* Günlük kredi tavanı: Browseract kredi tükenmesine karşı guard.
* Gerekçe: %30 çabayla trafik-spike riskinin \~%80'i kapatılır; full mimari beklenmez.

### Çıkış Kriterleri

* Kullanıcı, en zayıf platform/issue'suna eşlenmiş kişiselleştirilmiş Crew önerisi görür.
* Crew webhook payload'u eşleşen service_id içerir.
* Full cache üretimde; cache hit rate ölçülüyor.

### KPI Bağlantısı

* Free checker → Crew lead conversion rate `[TO VERIFY: baseline yok]`.
* Cache hit rate (master PRD §10.3) `[TO VERIFY: hedef]`.
* Recommendation → service CTA click-through rate.

---

## Phase C — İzleme ve Retention (Ay 5–6)

Amaç: Tek seferlik audit'i sürekli izlemeye çevirerek retention yaratmak. Güvenilir baseline (Phase A) ve oturmuş cache/maliyet (Phase B3) ön koşuldur.

### Kapsam

* Continuous monitoring: kullanıcı sitesi için periyodik yeniden tarama ve skor trendi.
* Citation takibi: markanın AI cevaplarında anılma sıklığının izlenmesi `[TO VERIFY: veri kaynağı ve maliyet]`.
* Trend uyarıları: skor düştüğünde/citation kaybında bildirim → yeni Crew lead tetikleyicisi.

### Ön Koşullar (kapı)

* Phase A tekrarlanabilirlik kriteri karşılanmış olmalı (aksi halde trend verisi yanıltıcı).
* Birim ekonomi doğrulanmış olmalı `[TO VERIFY: kredi/maliyet matematiği]` — sürekli tarama sürekli maliyettir.

### Çıkış Kriterleri

* Kullanıcı skor trend grafiği görebiliyor.
* Skor düşüşü/citation kaybı otomatik uyarı + Crew lead tetikliyor.

### KPI Bağlantısı

* Monitoring opt-in rate ve 30-günlük retention `[TO VERIFY: baseline yok]`.
* Trend-driven lead rate.

---

## Koşullu Bahis — Platform Kapsamı Genişletme (Ay 4 sonrası, kapıya bağlı)

Bu bir zaman-planlı faz değil, koşullu bir maddedir.

* Kapı koşulu: Çekirdek 4 platformun (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot) per-platform readiness confidence skoru ≥0.85.
* Koşul karşılanmazsa: Yeni motor (Gemini/Claude/DeepSeek) eklenmez; efor çekirdek confidence'ı yükseltmeye harcanır.
* Koşul karşılanırsa: +1 motor pilotu değerlendirilir.
* `[TO VERIFY]` Ticari baskı var mı? (örn. Crew müşterilerinin Gemini görünürlüğü talebi) Varsa kapı önceki değerlendirilir.

Gerekçe: Mevcut per-platform skorlar deneysel ve lokal-türetilmiş (0.6–0.8 confidence). Yeni platform eklemek derinliği artırmaz, aynı belirsizliği yatay çoğaltır. Mevcut 4'ü sağlamlaştırmak daha yüksek getirilidir.

---

## Ölçüm Yaklaşımı

* Release-instrument-first: her faz özelliği, ilgili event'ler tanımlanmadan üretime çıkmaz.
* Her faz çıkış kriteri, master PRD §10.3 metriklerine bağlanır.
* `[TO VERIFY]` işaretli tüm baseline'lar, Phase A sonunda ilk üretim verisiyle güncellenir.

### İzlenecek Ana Event'ler

* Score explanation view (kırılım açma)
* Repeatability variance (aynı URL tekrar tarama)
* Recommendation → service CTA click
* Free checker → Crew lead conversion
* Monitoring opt-in ve trend-alert tetikleme

---

## Bağımlılıklar ve Açık Doğrulamalar

* `[TO VERIFY: Crew catalog format]` — B1 kapsamını ve timeline'ı belirler (+2–3 hafta riski).
* `[TO VERIFY: SPA render varyans kaynağı]` — Phase A engine işinin büyüklüğünü belirler.
* `[TO VERIFY: kredi/maliyet birim ekonomisi]` — Phase C'nin ekonomik uygulanabilirliğini belirler.
* `[TO VERIFY: TTL değerleri, cache hit hedefi, dönüşüm baseline'ları]` — KPI hedefleri.
* `[TO VERIFY: platform kapsamı ticari baskısı]` — koşullu bahsin önceliği.

---

## Master PRD'ye Geri Besleme

* Phase A (tekrarlanabilirlik + açıklanabilirlik) master PRD'de eksik; PRD'ye yeni bir gereksinim grubu olarak eklenmeli.
* B2 tag→service eşleştirme master PRD P1'de detaylı değil; genişletilmeli.
* Bu belge ile master PRD §17 çift-yönlü referanslanmalı.
