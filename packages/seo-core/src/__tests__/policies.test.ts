import { describe, it, expect } from "vitest";
import {
  buildRobotsTxt,
  buildSitemapXml,
  buildSitemapUrl,
  buildFeedXml,
  buildLlmsTxt,
  shouldNoIndexForQueryState,
  filterSitemapUrls,
  filterFeedEntries,
  DEFAULT_DISALLOWED_PREFIXES,
} from "../index.js";

const siteUrl = "https://seovista.com";

describe("seo-core robots/sitemap/feed/llms policies", () => {
  it("robots.txt contains exactly one sitemap declaration and valid groups", () => {
    const robots = buildRobotsTxt({ sitemapUrl: `${siteUrl}/sitemap.xml` });
    expect(robots).toContain("Sitemap: https://seovista.com/sitemap.xml");
    const sitemapMatches = robots.match(/^Sitemap: /gm);
    expect(sitemapMatches).toHaveLength(1);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    for (const prefix of DEFAULT_DISALLOWED_PREFIXES) {
      expect(robots).toContain(`Disallow: ${prefix}`);
    }
    expect(robots).toContain("User-agent: ChatGPT-User");
  });

  it("sitemap.xml is well-formed XML with only trusted URLs", () => {
    const urls = [
      buildSitemapUrl(siteUrl, "/"),
      buildSitemapUrl(siteUrl, "/geo/"),
      buildSitemapUrl(siteUrl, "/seo/"),
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
    expect(xml).toContain("https://seovista.com/");
    expect(xml).toContain("https://seovista.com/geo/");
    // Sitemap <loc> URLs must be query-free and fragment-free.
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    for (const loc of locs) {
      expect(loc).not.toContain("?");
      expect(loc).not.toContain("#");
    }
  });

  it("feed.xml is valid Atom with self link and entries", () => {
    const feed = buildFeedXml({
      siteUrl,
      title: "SeoVista Insights",
      description: "Research and insights.",
      feedUrl: `${siteUrl}/feed.xml`,
      entries: [
        {
          id: `${siteUrl}/insights/article/`,
          title: "Article",
          description: "Description.",
          link: `${siteUrl}/insights/article/`,
          publishedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    expect(feed).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(feed).toContain("SeoVista Insights");
    expect(feed).toContain("https://seovista.com/feed.xml");
    expect(feed).toContain("https://seovista.com/insights/article/");
  });

  it("llms.txt is truthful and contains no ranking-factor promise", () => {
    const txt = buildLlmsTxt({
      siteUrl,
      description:
        "SeoVista is a foundation-stage GEO and search-visibility project. It does not promise rankings or AI-model inclusion.",
      resources: [
        { url: `${siteUrl}/geo/`, title: "GEO Readiness" },
        { url: `${siteUrl}/tools/`, title: "Tools" },
      ],
    });
    expect(txt).toContain("SeoVista");
    expect(txt).toContain("https://seovista.com/");
    expect(txt).toContain("https://seovista.com/geo/");
    expect(txt).not.toContain("ranking factor");
    expect(txt).not.toContain("AI Visibility");
    expect(txt).not.toContain("guarantee");
  });

  it("shouldNoIndexForQueryState returns true for non-empty search params", () => {
    expect(shouldNoIndexForQueryState("/geo/", { preview: "1" })).toBe(true);
    expect(shouldNoIndexForQueryState("/geo/", new URLSearchParams("?state=1"))).toBe(true);
    expect(shouldNoIndexForQueryState("/geo/", {})).toBe(false);
    expect(shouldNoIndexForQueryState("/geo/")).toBe(false);
  });

  it("filterSitemapUrls removes duplicate locations", () => {
    const urls = [
      buildSitemapUrl(siteUrl, "/geo/"),
      buildSitemapUrl(siteUrl, "/geo/"),
      buildSitemapUrl(siteUrl, "/seo/"),
    ];
    const filtered = filterSitemapUrls(urls);
    expect(filtered).toHaveLength(2);
  });

  it("filterFeedEntries removes duplicate IDs", () => {
    const entries = [
      { id: "a", title: "A", description: "", link: "", publishedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", title: "A", description: "", link: "", publishedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", title: "B", description: "", link: "", publishedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const filtered = filterFeedEntries(entries);
    expect(filtered).toHaveLength(2);
  });
});
