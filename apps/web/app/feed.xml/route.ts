import { NextResponse } from "next/server";
import { buildFeedXml } from "@seovista/seo-core";
import { siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "application/atom+xml; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function GET(): NextResponse {
  const body = buildFeedXml({
    siteUrl,
    title: "SeoVista Insights",
    description: "Research and guides on generative engine optimization, search visibility, and digital authority.",
    feedUrl: `${siteUrl}/feed.xml`,
    entries: [],
    language: "en",
  });
  return new NextResponse(body, { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(null, { headers: securityHeaders });
}
