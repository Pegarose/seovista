import { NextResponse } from "next/server";
import { buildLlmsTxt } from "@seovista/seo-core";
import { publicLlmsContent, siteUrl } from "../../src/content/site";

const securityHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function buildLlmsBody(): string {
  return buildLlmsTxt({
    siteUrl,
    description:
      "SeoVista is a foundation-stage editorial intelligence lab for generative engine optimization and search visibility. This site is informational and does not claim ranking-factor benefits or promised inclusion in AI models.",
    resources: publicLlmsContent().map((page) => ({
      title: page.title,
      url: page.canonical.absolute,
    })),
  });
}

export function GET(): NextResponse {
  return new NextResponse(buildLlmsBody(), { headers: securityHeaders });
}

export function HEAD(): NextResponse {
  return new NextResponse(null, { headers: securityHeaders });
}
