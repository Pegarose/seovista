import { NextResponse } from "next/server";
import { buildSitemapXml, buildSitemapUrl } from "@seovista/seo-core";
import { allSitemapPages, siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "application/xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function buildSitemapBody(): string {
  const pages = allSitemapPages();
  const urls = pages.map((page) => buildSitemapUrl(siteUrl, page.canonical.path));
  return buildSitemapXml(urls);
}

export function GET(): NextResponse {
  return new NextResponse(buildSitemapBody(), { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(buildSitemapBody(), { headers: securityHeaders });
}
