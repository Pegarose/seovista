import { NextResponse } from 'next/server';
import { getAdminDb } from '../../src/lib/admin/db';
import { createCmsRepository } from '@seovista/worker';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3101';

  let insightsMarkdown = '';
  try {
    const repo = createCmsRepository(getAdminDb());
    const insights = await repo.getPublishedInsights();

    insightsMarkdown = insights
      .map(
        (insight) =>
          `- [${insight.title}](${baseUrl}/insights/${insight.slug})`
      )
      .join('\n');
  } catch (error) {
    console.error('Error fetching insights for llms.txt:', error);
  }

  const markdownContent = `# SeoVista - Global GEO & Search Visibility Website

> Visibility is earned, not engineered. SeoVista is an editorial intelligence lab focused on Generative Engine Optimization, traditional SEO, and digital authority.

## Core Properties
- [Homepage](${baseUrl}/)
- [About Us](${baseUrl}/about/)
- [GEO Services](${baseUrl}/geo/)
- [SEO Services](${baseUrl}/seo/)
- [GEO Readiness Checker Tool](${baseUrl}/tools/geo-readiness-checker/)

## Published Labs & Insights
${insightsMarkdown}
`;

  return new NextResponse(markdownContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
