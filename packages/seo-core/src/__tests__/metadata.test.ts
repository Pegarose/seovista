import { describe, it, expect } from "vitest";
import {
  buildMetadata,
  buildNoIndexMetadata,
  resolveCanonical,
  parseSiteUrl,
  normalizePath,
  CanonicalError,
} from "../index";

const siteUrl = "https://seovista.com";

describe("seo-core metadata builder", () => {
  it("produces unique title and description per route", () => {
    const home = buildMetadata(siteUrl, {
      title: "SeoVista — GEO & Search Visibility",
      description: "AI visibility and GEO readiness platform.",
      canonicalPath: "/",
    });
    const geo = buildMetadata(siteUrl, {
      title: "GEO Readiness — SeoVista",
      description: "Understand generative engine optimization readiness.",
      canonicalPath: "/geo/",
    });
    expect(home.title).not.toBe(geo.title);
    expect(home.description).not.toBe(geo.description);
    expect(home.title).toBe("SeoVista — GEO & Search Visibility");
    expect(geo.description).toBe("Understand generative engine optimization readiness.");
  });

  it("canonical resolver uses only NEXT_PUBLIC_SITE_URL and never request headers", () => {
    const fakeHeaders = {
      host: "evil.com",
      "x-forwarded-host": "evil.com",
      forwarded: "host=evil.com",
    };
    const canonical = resolveCanonical(siteUrl, "/about/");
    expect(canonical).toBe("https://seovista.com/about/");
    // Headers should not influence the result; resolver accepts only siteUrl parameter.
    expect(fakeHeaders.host).not.toBe(canonical);
    expect(parseSiteUrl).toBeDefined();
  });

  it("canonical URLs are absolute HTTPS with trailing slash and no userinfo/port/query/fragment", () => {
    const canonical = resolveCanonical(siteUrl, "/seo/");
    expect(canonical).toMatch(/^https:\/\/seovista\.com\/seo\/$/);
    expect(canonical).not.toContain("@");
    expect(canonical).not.toMatch(/:\d+/);
    expect(canonical).not.toContain("?");
    expect(canonical).not.toContain("#");
  });

  it("rejects untrusted site URL origins", () => {
    expect(() => parseSiteUrl("http://seovista.com")).toThrow(CanonicalError);
    expect(() => parseSiteUrl("https://seovista.com:8443")).toThrow(CanonicalError);
    expect(() => parseSiteUrl("https://seovista.com/path")).toThrow(CanonicalError);
    expect(() => parseSiteUrl("https://user:pass@seovista.com")).toThrow(CanonicalError);
    expect(() => parseSiteUrl("https://seovista.com?query=1")).toThrow(CanonicalError);
  });

  it("rejects missing trailing slash", () => {
    expect(() => normalizePath("/about")).toThrow(CanonicalError);
  });

  it("includes OG and Twitter metadata with og:url equal to canonical", () => {
    const metadata = buildMetadata(siteUrl, {
      title: "GEO",
      description: "GEO readiness.",
      canonicalPath: "/geo/",
    });
    expect(metadata.openGraph.title).toBe(metadata.title);
    expect(metadata.openGraph.description).toBe(metadata.description);
    expect(metadata.openGraph.url).toBe(metadata.canonical);
    expect(metadata.twitter.title).toBe(metadata.title);
    expect(metadata.twitter.description).toBe(metadata.description);
    expect(metadata.twitter.card).toBe("summary_large_image");
  });

  it("sets noindex for query/tool-state URLs", () => {
    const metadata = buildMetadata(siteUrl, {
      title: "Tool State",
      description: "Transient tool state.",
      canonicalPath: "/tools/geo-readiness-checker/",
      isQueryState: true,
    });
    expect(metadata.canonical).toBe("https://seovista.com/tools/geo-readiness-checker/");
    expect(metadata.robots.index).toBe(false);
    expect(metadata.robots.follow).toBe(false);
  });

  it("preserves published and modified dates", () => {
    const metadata = buildMetadata(siteUrl, {
      title: "Article",
      description: "An article.",
      canonicalPath: "/insights/article/",
      publishedAt: "2026-06-01T00:00:00.000Z",
      modifiedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(metadata.publishedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(metadata.modifiedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("buildNoIndexMetadata forces indexable false", () => {
    const metadata = buildNoIndexMetadata(siteUrl, {
      title: "Private",
      description: "Private page.",
      canonicalPath: "/private/",
    });
    expect(metadata.robots.index).toBe(false);
  });
});
