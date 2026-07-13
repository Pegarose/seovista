import { NextResponse } from "next/server";
import { buildFeedXml } from "@seovista/seo-core";
import type { ContentEntity } from "@seovista/content-models";
import { publicFeedContent, siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "application/atom+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function isFeedEntry(
  entity: ContentEntity
): entity is Extract<ContentEntity, { title: string; description: string }> {
  return "title" in entity && "description" in entity;
}

export function buildFeedBody(): string {
  const entries = publicFeedContent()
    .filter(isFeedEntry)
    .map((entity) => ({
      id: entity.canonical.absolute,
      title: entity.title,
      description: entity.description,
      link: entity.canonical.absolute,
      publishedAt: entity.publishedAt ?? entity.provenance.createdAt,
      modifiedAt: entity.modifiedAt,
    }));

  return buildFeedXml({
    siteUrl,
    title: "SeoVista Insights",
    description:
      "Research and guides on generative engine optimization, search visibility, and digital authority.",
    feedUrl: `${siteUrl}/feed.xml`,
    entries,
    updatedAt: "2026-07-13T00:00:00.000Z",
    language: "en",
  });
}

export function GET(): NextResponse {
  return new NextResponse(buildFeedBody(), { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(null, { headers: securityHeaders });
}
