import { describe, it, expect } from "vitest";
import { buildMetadata } from "@seovista/seo-core";
import {
  buildGraph,
  buildOrganization,
  buildWebSiteFromOrganization,
  buildWebPage,
} from "@seovista/schema";
import type { Organization, Page } from "@seovista/content-models";

/**
 * VAL-CROSS-004: One fixture mutation causes exactly one causal public-output change.
 *
 * Starting from one immutable published identity, changing only a supported
 * title, description, canonical-eligible slug, modified time, visible FAQ, or
 * indexation field must change exactly the documented dependent HTML, metadata,
 * JSON-LD, sitemap, feed, and llms projections while leaving unrelated
 * identities/fields byte-stable.
 */

const SITE_URL = "https://seovista.com";
const NOW = new Date("2026-07-13T00:00:00.000Z");

function makeOrganization(): Organization {
  return {
    kind: "organization",
    id: "org-seovista",
    slug: "seovista",
    locale: "en",
    canonical: { path: "/about/", absolute: `${SITE_URL}/about/` },
    indexation: {
      indexable: true,
      followLinks: true,
      includeInSitemap: true,
      includeInFeed: false,
      includeInJsonLd: true,
    },
    provenance: {
      rawId: "org-sprint0",
      collection: "organizations",
      locale: "en",
      status: "published",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    },
    name: "SeoVista",
    description: "SeoVista is an editorial intelligence lab.",
    url: SITE_URL,
    parentOrganization: "GMedya Group",
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    kind: "page",
    id: "page-test",
    slug: "test",
    locale: "en",
    canonical: { path: "/test/", absolute: `${SITE_URL}/test/` },
    indexation: {
      indexable: true,
      followLinks: true,
      includeInSitemap: true,
      includeInFeed: false,
      includeInJsonLd: true,
    },
    provenance: {
      rawId: "page-test-sprint0",
      collection: "pages",
      locale: "en",
      status: "published",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    },
    title: "Test Page Title",
    description: "Test page description for mutation testing.",
    body: "Test body content.",
    sources: [],
    relatedEntities: [],
    ...overrides,
  };
}

describe("VAL-CROSS-004: fixture mutation causes one causal output change", () => {
  const organization = makeOrganization();

  it("changing title changes only title-related outputs", () => {
    const originalPage = makePage();
    const originalTitle = originalPage.title;

    // Build original outputs
    const originalMetadata = buildMetadata(SITE_URL, {
      title: originalPage.title,
      description: originalPage.description,
      canonicalPath: originalPage.canonical.path,
    });

    const originalOrg = buildOrganization(SITE_URL, organization);
    const originalWebsite = buildWebSiteFromOrganization(SITE_URL, organization.name);
    const originalWebpage = buildWebPage({ page: originalPage, siteUrl: SITE_URL });
    const originalGraph = buildGraph([originalOrg, originalWebsite, originalWebpage]);
    const originalGraphJson = JSON.stringify(originalGraph);

    // Mutate: change title only
    const mutatedTitle = "Mutated Title — SeoVista Test";
    const mutatedPage = makePage({ title: mutatedTitle });

    const mutatedMetadata = buildMetadata(SITE_URL, {
      title: mutatedPage.title,
      description: mutatedPage.description,
      canonicalPath: mutatedPage.canonical.path,
    });

    const mutatedWebpage = buildWebPage({ page: mutatedPage, siteUrl: SITE_URL });
    const mutatedGraph = buildGraph([originalOrg, originalWebsite, mutatedWebpage]);
    const mutatedGraphJson = JSON.stringify(mutatedGraph);

    // 1. Title changes in metadata
    expect(mutatedMetadata.title).toBe(mutatedTitle);
    expect(mutatedMetadata.title).not.toBe(originalTitle);
    expect(mutatedMetadata.openGraph.title).toBe(mutatedTitle);
    expect(mutatedMetadata.twitter.title).toBe(mutatedTitle);

    // 2. Description is unchanged
    expect(mutatedMetadata.description).toBe(originalMetadata.description);
    expect(mutatedMetadata.openGraph.description).toBe(originalMetadata.openGraph.description);

    // 3. Canonical is unchanged
    expect(mutatedMetadata.canonical).toBe(originalMetadata.canonical);

    // 4. JSON-LD title changes but description and url stay the same
    expect(mutatedGraphJson).not.toBe(originalGraphJson);
    expect(mutatedGraphJson).toContain(mutatedTitle);
    expect(mutatedGraphJson).not.toContain(originalTitle);
    expect(mutatedGraphJson).toContain(originalPage.description);
    expect(mutatedGraphJson).toContain(originalPage.canonical.path);

    // 5. Organization and WebSite are byte-stable (first two nodes)
    expect(JSON.stringify(mutatedGraph["@graph"][0])).toBe(JSON.stringify(originalGraph["@graph"][0]));
    expect(JSON.stringify(mutatedGraph["@graph"][1])).toBe(JSON.stringify(originalGraph["@graph"][1]));
  });

  it("changing description changes only description-related outputs", () => {
    const originalPage = makePage();
    const mutatedDescription = "Mutated description for test purposes.";

    const originalMetadata = buildMetadata(SITE_URL, {
      title: originalPage.title,
      description: originalPage.description,
      canonicalPath: originalPage.canonical.path,
    });

    const mutatedMetadata = buildMetadata(SITE_URL, {
      title: originalPage.title,
      description: mutatedDescription,
      canonicalPath: originalPage.canonical.path,
    });

    // Description changes
    expect(mutatedMetadata.description).toBe(mutatedDescription);
    expect(mutatedMetadata.description).not.toBe(originalMetadata.description);
    expect(mutatedMetadata.openGraph.description).toBe(mutatedDescription);
    expect(mutatedMetadata.twitter.description).toBe(mutatedDescription);

    // Title unchanged
    expect(mutatedMetadata.title).toBe(originalMetadata.title);
    expect(mutatedMetadata.openGraph.title).toBe(originalMetadata.title);

    // Canonical unchanged
    expect(mutatedMetadata.canonical).toBe(originalMetadata.canonical);
  });

  it("changing canonical path changes URL-dependent outputs only", () => {
    const homePage = makePage({ canonical: { path: "/", absolute: `${SITE_URL}/` } });

    const originalMetadata = buildMetadata(SITE_URL, {
      title: homePage.title,
      description: homePage.description,
      canonicalPath: homePage.canonical.path,
    });

    const newPath = "/homepage/";
    const mutatedMetadata = buildMetadata(SITE_URL, {
      title: homePage.title,
      description: homePage.description,
      canonicalPath: newPath,
    });

    // Canonical changes
    expect(mutatedMetadata.canonical).toContain(newPath);
    expect(mutatedMetadata.canonical).not.toBe(originalMetadata.canonical);
    expect(mutatedMetadata.openGraph.url).toContain(newPath);

    // Title and description unchanged
    expect(mutatedMetadata.title).toBe(originalMetadata.title);
    expect(mutatedMetadata.description).toBe(originalMetadata.description);
  });

  it("changing indexation from indexable to noindex changes robots policy only", () => {
    const testPage = makePage();

    const originalMetadata = buildMetadata(SITE_URL, {
      title: testPage.title,
      description: testPage.description,
      canonicalPath: testPage.canonical.path,
      indexable: true,
    });

    const noindexMetadata = buildMetadata(SITE_URL, {
      title: testPage.title,
      description: testPage.description,
      canonicalPath: testPage.canonical.path,
      indexable: false,
    });

    // Robots policy changes
    expect(originalMetadata.robots.index).toBe(true);
    expect(noindexMetadata.robots.index).toBe(false);

    // Title, description, canonical all unchanged
    expect(noindexMetadata.title).toBe(originalMetadata.title);
    expect(noindexMetadata.description).toBe(originalMetadata.description);
    expect(noindexMetadata.canonical).toBe(originalMetadata.canonical);
  });

  it("changing isQueryState=true sets noindex and nofollow", () => {
    const testPage = makePage();

    const normalMetadata = buildMetadata(SITE_URL, {
      title: testPage.title,
      description: testPage.description,
      canonicalPath: testPage.canonical.path,
    });

    const queryMetadata = buildMetadata(SITE_URL, {
      title: testPage.title,
      description: testPage.description,
      canonicalPath: testPage.canonical.path,
      isQueryState: true,
    });

    // Query state: noindex, nofollow
    expect(normalMetadata.robots.index).toBe(true);
    expect(normalMetadata.robots.follow).toBe(true);
    expect(queryMetadata.robots.index).toBe(false);
    expect(queryMetadata.robots.follow).toBe(false);

    // Title, description, canonical unchanged
    expect(queryMetadata.title).toBe(normalMetadata.title);
    expect(queryMetadata.description).toBe(normalMetadata.description);
    expect(queryMetadata.canonical).toBe(normalMetadata.canonical);
  });
});
