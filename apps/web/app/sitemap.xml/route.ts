import { NextResponse } from "next/server";
import { buildSitemapXml, buildSitemapUrl } from "@seovista/seo-core";
import { publicSitemapContent, siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "application/xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function buildSitemapBody(): string {
  const urls = publicSitemapContent().map((entity) => ({
    ...buildSitemapUrl(siteUrl, entity.canonical.path),
    lastmod: "modifiedAt" in entity ? entity.modifiedAt : entity.provenance.updatedAt,
  }));
  return buildSitemapXml(urls);
}

export function GET(): NextResponse {
  return new NextResponse(buildSitemapBody(), { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(buildSitemapBody(), { headers: securityHeaders });
}
