import { describe, it, expect } from "vitest";
import { buildPublicProjectionMatrix, type PublicProjectionMatrixOptions } from "../../src/content/public-projections";
import { createAdapter } from "@seovista/content-models";

describe("Public Projections Isolation", () => {
  it("never includes drafts or private entries in generating sitemap, json-ld, html, metadata, feed, or llms.txt", () => {
    const siteUrl = "https://seovista.app";
    const now = new Date("2026-07-18T12:00:00Z").toISOString();

    const mockEntities = [
      {
        kind: "page" as const,
        id: "pub-1",
        slug: "pub-1",
        locale: "en",
        canonical: { path: "/public-page/", absolute: `${siteUrl}/public-page/` },
        title: "Public Page",
        description: "A public page",
        body: "Public content",
        publishedAt: now,
        sources: [],
        relatedEntities: [],
        indexation: { indexable: true, followLinks: true, includeInSitemap: true, includeInJsonLd: true, includeInFeed: true },
        provenance: { rawId: "pub-1", collection: "pages" as const, createdAt: now, updatedAt: now, status: "published" as const, locale: "en", version: 1 }
      },
      {
        kind: "page" as const,
        id: "draft-1",
        slug: "draft-1",
        locale: "en",
        canonical: { path: "/draft-page/", absolute: `${siteUrl}/draft-page/` },
        title: "Draft Page",
        description: "A draft page",
        body: "Draft content",
        publishedAt: now,
        sources: [],
        relatedEntities: [],
        indexation: { indexable: false, followLinks: false, includeInSitemap: false, includeInJsonLd: false, includeInFeed: false },
        provenance: { rawId: "draft-1", collection: "pages" as const, createdAt: now, updatedAt: now, status: "draft" as const, locale: "en", version: 1 }
      },
      {
        kind: "page" as const,
        id: "private-1",
        slug: "private-1",
        locale: "en",
        canonical: { path: "/private-page/", absolute: `${siteUrl}/private-page/` },
        title: "Private Page",
        description: "A private page",
        body: "Private content",
        publishedAt: now,
        sources: [],
        relatedEntities: [],
        indexation: { indexable: false, followLinks: false, includeInSitemap: false, includeInJsonLd: false, includeInFeed: false },
        provenance: { rawId: "private-1", collection: "pages" as const, createdAt: now, updatedAt: now, status: "private" as const, locale: "en", version: 1 }
      }
    ];

    const mapOptions = {
      trustedSiteUrl: siteUrl,
      supportedLocales: ["en"],
      defaultLocale: "en",
      mode: { kind: "public" as const, now: new Date(now) }
    };

    const adapter = createAdapter(mockEntities, mapOptions);

    const options: PublicProjectionMatrixOptions = {
      adapter,
      siteUrl,
      now
    };

    const matrix = buildPublicProjectionMatrix(options);

    // Verify sitemap string size indirectly and content (only 1 <url> expected usually, but we check length of match or parsing)
    // A more absolute mathematical proof of boundary isolation:
    const sitemapUrlCount = (matrix.sitemap.match(/<url>/g) || []).length;
    expect(sitemapUrlCount).toBe(1);
    expect(matrix.sitemap).toContain("/public-page");
    expect(matrix.sitemap).not.toContain("/draft-page");
    expect(matrix.sitemap).not.toContain("/private-page");

    // Verify HTML array only includes the published page
    expect(matrix.html.length).toBe(1);
    const htmlJoined = matrix.html.join("");
    expect(htmlJoined).toContain("Public Page");
    expect(htmlJoined).not.toContain("Draft Page");
    expect(htmlJoined).not.toContain("Private Page");

    // Verify JSON-LD array only includes the published page
    expect(matrix.jsonLd.length).toBe(1);
    const jsonLdJoined = matrix.jsonLd.join("");
    expect(jsonLdJoined).toContain("/public-page");
    expect(jsonLdJoined).not.toContain("/draft-page");
    expect(jsonLdJoined).not.toContain("/private-page");

    // Verify Metadata array only includes the published page
    expect(matrix.metadata.length).toBe(1);
    const metadataJoined = matrix.metadata.join("");
    expect(metadataJoined).toContain("Public Page");
    expect(metadataJoined).not.toContain("Draft Page");
    expect(metadataJoined).not.toContain("Private Page");
    
    // Verify Feed string only includes the published page
    const feedEntryCount = (matrix.feed.match(/<entry>/g) || []).length;
    expect(feedEntryCount).toBe(1);
    expect(matrix.feed).toContain("/public-page");
    expect(matrix.feed).not.toContain("/draft-page");
    expect(matrix.feed).not.toContain("/private-page");

    // Verify LLMS string only includes the published page
    const llmsMatches = (matrix.llms.match(/- https:\/\/seovista\.app\/[a-z-]+/g) || []);
    expect(llmsMatches.length).toBe(1);
    expect(matrix.llms).toContain("/public-page");
    expect(matrix.llms).not.toContain("/draft-page");
    expect(matrix.llms).not.toContain("/private-page");
  });
});
