import { NextResponse } from "next/server";
import { buildLlmsTxt } from "@seovista/seo-core";
import { siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function GET(): NextResponse {
  const body = buildLlmsTxt({
    siteUrl,
    description:
      "SeoVista is a foundation-stage editorial intelligence lab for generative engine optimization and search visibility. This site is informational and does not claim ranking-factor benefits or promised inclusion in AI models.",
    resources: [
      { title: "GEO", url: `${siteUrl}/geo/` },
      { title: "SEO", url: `${siteUrl}/seo/` },
      { title: "Digital Authority", url: `${siteUrl}/digital-authority/` },
      { title: "Free Tools", url: `${siteUrl}/tools/` },
      { title: "About", url: `${siteUrl}/about/` },
      { title: "Insights", url: `${siteUrl}/insights/` },
    ],
  });
  return new NextResponse(body, { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(null, { headers: securityHeaders });
}
