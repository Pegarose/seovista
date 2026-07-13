import { NextResponse } from "next/server";
import { buildRobotsTxt } from "@seovista/seo-core";
import { siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function GET(): NextResponse {
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const body = buildRobotsTxt({
    sitemapUrl,
    disallowedPrefixes: [
      "/api/",
      "/admin/",
      "/account/",
      "/preview/",
      "/private-audit/",
      "/tokenized/",
      "/draft/",
      "/_next/",
    ],
  });
  return new NextResponse(body, { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const body = buildRobotsTxt({
    sitemapUrl,
    disallowedPrefixes: [
      "/api/",
      "/admin/",
      "/account/",
      "/preview/",
      "/private-audit/",
      "/tokenized/",
      "/draft/",
      "/_next/",
    ],
  });
  return new NextResponse(body, { headers: securityHeaders });
}
