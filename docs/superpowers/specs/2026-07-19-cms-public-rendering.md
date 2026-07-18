# SeoVista CMS Public Rendering Specification

Bu belge, SeoVista projesindeki ziyaretçiye açık (Public Marketing) sayfalarda CMS altyapısını kullanarak veritabanındaki (`cms_entries` ve `cms_revisions`) içeriklerin Next.js Server Component'leri ile nasıl render edileceğini açıklar.

## 1. Mimari Kriterler ve Prensipler

- **Sıfır Client State:** Bütün sayfa oluşturma (Render) işlemleri yalnızca Next.js Server Component kullanılarak yapılacaktır. Gerekmedikçe `use client` direktifi hiçbir şekilde kullanılmayacaktır. Sayfa hiyerarşisi yalnızca JSX olarak tasarlanmalıdır.
- **Güvenlik ve İzolasyon:** Herhangi bir taslak ("draft") ya da yayına kapalı içerik, canlı sayfaların HTML'ine, metasına veya alt verilerine kesinlikle sızdırılmamalıdır. Yalnızca "published" statüsündeki içerikler ve bloklar ziyaretçiye sunulacaktır.
- **Repository Pattern:** Veritabanı (PostgreSQL) ile Next.js arasındaki veri akışı doğrudan sayfa düzeyinde bağımsız sorgular yerine, izole edilmiş bir veri okuma ("Repository") katmanı aracılığıyla yapılarak mimari bütünlük sürdürülecektir.

## 2. Next.js Routing Yapısı (App Router)

"Insight" (blog) yayınlarının gösterimi için Next.js App Router üzerinde aşağıdaki klasör ve dosya yapısı kullanılacaktır:

```text
app/
 └── insights/
      ├── page.tsx               # Tüm yayınlanmış makalelerin listeleneceği ana sayfa (/insights)
      └── [slug]/
           └── page.tsx          # Dinamik URL (/insights/foo-bar) ile tekil içeriğin detayının gösterildiği sayfa
```

## 3. Data Fetching & Repository Katmanı Tasarımı

CMS verilerine güvenli erişim için CMS Repository servis metotları şu kurallara riayet edecektir:

- `getPublishedInsights()`: Statüsü sadece `published` olan girişlerin meta verilerini ve listesini çekecek, `/insights` liste sayfasını besleyecektir.
- `getPublishedInsightBySlug(slug: string)`: `app/insights/[slug]/page.tsx` dinamik sayfasını besleyecektir. `cms_entries` ve sadece onaylanmış, yayında olan `cms_revisions` (ya da entry statüsü) kayıtlarını dikkate alacaktır. 

Örnek Veritabanı Okuma İmzası:
```typescript
// Sadece 'published' kaydını getiren metodoloji. Seçilmiş olan ORM ya da Raw SQL tabanı üzerinde kurgulanacaktır:
export async function getPublishedInsightBySlug(slug: string) {
  return await db.query(`
    SELECT e.slug, e.title, r.blocks, r.published_at
    FROM cms_entries e
    JOIN cms_revisions r ON e.id = r.entry_id
    WHERE e.status = 'published' AND e.slug = $1
    ORDER BY r.created_at DESC LIMIT 1
  `, [slug]);
}
```

## 4. Sayfa ve Blok Render Mimarisi (Server Components)

Aşağıdaki şemalar dinamik detay sayfası ve blokların hiçbir state içermeden yalnızca Server Component olarak nasıl dağıtılacağını resmeder:

### Dinamik Detay Sayfası (`app/insights/[slug]/page.tsx`)

```tsx
import { notFound } from 'next/navigation';
import { getPublishedInsightBySlug } from '@/repositories/cms';
import { BlockRenderer } from '@/components/cms/BlockRenderer';

export default async function InsightDetailPage({ params }: { params: { slug: string } }) {
  const insight = await getPublishedInsightBySlug(params.slug);

  if (!insight) {
    notFound(); // Bulunamayan ya da draft olan içerikler için 404
  }

  return (
    <main>
      <h1>{insight.title}</h1>
      <article>
        {/* Next.js Server olarak blokların map edilip çizilmesi */}
        <BlockRenderer blocks={insight.blocks} />
      </article>
    </main>
  );
}
```

### Blokların Parse Edilmesi ve Yansıtılması (`BlockRenderer`)

Veritabanından JSON objesi halinde gelen ve tipleri belirlenmiş içerik düğümleri (örneğin `type: 'paragraph'`) sub-server component'lere dağıtılacaktır.

```tsx
import { ParagraphBlock } from './blocks/ParagraphBlock';
import { HeadingBlock } from './blocks/HeadingBlock';

export function BlockRenderer({ blocks }: { blocks: any[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return <ParagraphBlock key={index} data={block.data} />;
          case 'heading':
            return <HeadingBlock key={index} data={block.data} />;
          default:
            return null; // Bilinmeyen bloklarda güvenli pas geç
        }
      })}
    </>
  );
}
```

## 5. Uygulanacak Son Kararlar
- Veri getirme metodu içerisindeki statü filtresi (sadece `published`) ve PRD'deki tüm SSR/RSC (Sıfır Use Client) yönergeleri gözetilmiştir.
- URL (`/insights/foo-bar`) mimarisi App Router standartları ile uyumludur. Canonical linkleme esnasında sadece çevresel değişken olan `NEXT_PUBLIC_SITE_URL` kullanımına dikkat edilecektir.
