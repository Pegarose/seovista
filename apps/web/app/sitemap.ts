import type { MetadataRoute } from 'next';
import { getAdminDb } from '../src/lib/admin/db';
import { createCmsRepository } from '@seovista/worker';
import { publicSitemapContent } from '../src/content/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3101';
  
  // Static pages
  const staticRoutes = publicSitemapContent().map(
    (page) => ({
      url: `${baseUrl}${page.canonical.path === '/' ? '/' : page.canonical.path}`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'daily' as const,
      priority: page.canonical.path === '/' ? 1 : 0.8,
    })
  );

  // Dynamic pages for published insights
  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const repo = createCmsRepository(getAdminDb());
    const insights = await repo.getPublishedInsights();
    
    dynamicRoutes = insights.map((insight) => ({
      url: `${baseUrl}/insights/${insight.slug}/`,
      lastModified: insight.published_at.toISOString(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('Error fetching insights for sitemap:', error);
  }

  return [...staticRoutes, ...dynamicRoutes];
}
