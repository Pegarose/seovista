
## Amaç

Hero ile sonraki bölüm arasındaki ani enerji düşüşünü gidermek. Hero'ya dokunmadan, altına kısmen bindirilen bir "SeoVista nasıl çalışır?" ürün anlatım paneli eklemek, geçişi katmanlı hale getirmek ve monoton üç-kart ritmini kırmak.

## Kapsam

Yalnızca `src/routes/index.tsx` (ana sayfa yapısı) ve gerekiyorsa `src/styles.css` (yumuşak yüzey tonu değişkeni + hafif glow yardımcıları). Hero bloğuna dokunulmaz. Diğer sayfalar, tokenlar, backend ve içerik sözleşmesi değişmez. Uydurma metrik, müşteri logosu, sahte sonuç eklenmez.

## Değişiklikler

### 1) Geçiş katmanı (hero altı)

Hero `section`'ının hemen ardından, hero'nun alt kenarını "kesmeyen" bir geçiş bandı:

- Hero'nun `border-b` sınırı kaldırılmadan, altına ~120px yüksekliğinde `relative` bir konteyner.
- Üstte hero peach glow'unun çok soluk devamı: tek bir geniş radial gradient (`oklch(0.93 0.055 60 / 0.18)` civarı), blur yüksek, yalnızca üst yarıda.
- Alt tarafa doğru `bg-paper`'a lineer geçiş, aralarda bir hairline çizgisi (mevcut `border-hairline`).
- Bu konteyner, ürün panelinin `-mt-[80px] md:-mt-[120px]` ile bindirilmesi için pozisyon referansı görevi görür.

### 2) "SeoVista nasıl çalışır?" ürün paneli (hero'ya bindirilir)

Hero'nun altına `-80px` (mobil) / `-120px` (desktop) taşan editoryal panel:

```text
+------------------------------------------------------------+
|  SOL: Yöntem akışı              |  SAĞ: Statik arayüz mock  |
|                                 |                            |
|  01 · Tarama                    |  [Editorial "brief card"]  |
|      Kaynak, yapı, sinyaller    |  - Başlık: Örnek çıktı     |
|                                 |  - Etiket: Non-operational |
|  02 · Görünürlük değerlendirme  |  - Bölümler: Clarity /     |
|      Anlaşılırlık, atıf, sağlık |    Attribution / Health    |
|                                 |  - Her satır: durum rozeti |
|  03 · Öncelikli aksiyonlar      |    ("observed", "missing", |
|      Sıralı, gerekçeli öneriler |     "review") — yalnızca   |
|                                 |     örnek etiketler        |
+------------------------------------------------------------+
```

- Kart: `rounded-xl border border-hairline bg-card`, ince gölge (`shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_24px_60px_-30px_rgba(0,0,0,0.15)]`), üst kenarında çok ince bir signal renkli hairline.
- Sol sütun: `MethodologyStep` bileşenine benzer numaralı akış (üç adım), mevcut `font-mono` eyebrow + `font-serif` başlık dili.
- Sağ sütun: gerçek bir dashboard değil — sade bir "brief card" mock'u. Tüm etiketler ve rozetler açıkça örnek olduğu belirtilir; sayı, yüzde, isim, logo yok. Üstte `StatusBadge`("Illustrative preview") kullanılır.
- Panel altında tek satır: "This is a static illustration of the intended workflow. No audit runs." — mevcut truthful stance ile uyumlu.
- Panel alt boşluğu, "The problem" bölümüyle arasında rahat bir hava bırakır; "The problem" bölümünün üst padding'i bir miktar azaltılır.

### 3) Kompakt güven katmanı (opsiyonel, doğrulanmış içerikle sınırlı)

Panelin hemen altında, tek satırlık ince bir şerit:

- İçerik yalnızca mevcut, doğrulanabilir öğelerden oluşur: "Foundation stage · Sprint 0", "Editorial research lab", "Public methodology", "No tracking on this page".
- Uydurma metrik, müşteri, ödül, rakam yok. Logo yok.
- Görsel: `border-y border-hairline`, mono küçük tipografi, noktalı ayraçlar, hafif `bg-mineral/40`.

Eğer bu ifadeler bile fazla pazarlama gibi hissedilirse bu şerit atlanır; karar implementasyon sırasında görsel dengeye göre verilir, ama varsayılan olarak eklenir.

### 4) "Three disciplines" bölümünün editoryal sıralara dönüştürülmesi

Mevcut üç eşit `EditorialCard` grid'i kaldırılır. Yerine 3 adet alternatif "editorial row":

```text
Row 1 (GEO):        [ metin sol  ]  [ görsel/mock sağ ]
Row 2 (SEO):        [ görsel sol ]  [ metin sağ       ]
Row 3 (Authority):  [ metin sol  ]  [ görsel/mock sağ ]
```

- Her satır: `grid md:grid-cols-12`, metin `md:col-span-5`, görsel `md:col-span-6`, aralarda 1 kolon nefes.
- Metin tarafı: mono eyebrow ("GEO" / "SEO" / "Authority"), `font-serif text-3xl` başlık, mevcut açıklama metni, altında ilgili sayfaya `CtaLink variant="secondary"` (`/geo/`, `/seo/`, `/digital-authority/`).
- Görsel tarafı: fotoğraf değil; küçük editoryal "artifact" kartları — örneğin GEO için minimal bir "citation trace" diyagramı, SEO için başlık/kanonik/robots satırlarını gösteren monospace bir belge kesiti, Authority için imza + tarih çizgisi. Hepsi saf CSS/SVG, örnek olduğu net.
- Satırlar arasında yalnızca `border-t border-hairline` ve rahat vertical padding; kutu içine hapsedilmez.

### 5) Alt bölümlerde hafif ritim düzeltmesi

- "Methodology" bloğunun arka planı `bg-mineral/50` olarak kalır; yalnızca ürün paneli ve editoryal sıralar eklendiği için bu bloğun üst boşluğu bir tık artırılır ki yeni yoğunluktan sonra nefes alsın.
- "GEO Readiness Checker" + "Editorial research" iki kutulu blok ve son CTA aynen kalır.

## Yapılmayacaklar

- Hero içeriği, animasyonları, köşe bracket'ları, "SeoVista Research Lab" alt frame'i değişmez.
- Glassmorphism, yoğun gradient, ikon üçlüsü kart deseni kullanılmaz.
- Uydurma metrik, müşteri logosu, sonuç, "trusted by" listesi eklenmez.
- Tasarım tokenları (renk/tipografi) değişmez; yalnızca gerekirse `styles.css`'e yardımcı bir yüzey tonu utility'si eklenir.
- Yeni route, yeni backend çağrısı, yeni bağımlılık yok.

## Teknik notlar

- Tüm değişiklikler sunum katmanında; iş mantığı yok.
- Bindirme için hero section'ı `overflow-hidden` olduğundan panelin `-mt` ile taşabilmesi için ürün paneli hero'nun DIŞINDA, kendi konteynerinde `relative z-10` olarak konumlandırılır; üstteki geçiş bandı `overflow-visible`.
- Erişilebilirlik: panel bir `section` içinde `aria-labelledby` ile başlığa bağlanır; editoryal sıralar semantik `article` değil basit `section` düzeninde kalır, başlık hiyerarşisi `h2` → `h3` korunur.
- Prefers-reduced-motion: yeni glow ve geçişler statik; ek animasyon eklenmez.
