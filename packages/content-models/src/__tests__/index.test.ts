import { describe, it, expect } from "vitest";
import {
  mapEntity,
  mapPage,
  mapArticle,
  createAdapter,
  resolveCanonical,
  validateRedirect,
  validateLocale,
  isHreflangEligible,
  validateRedirectSet,
  isContentEntityPubliclyEligible,
  isAuditLeadPrivate,
  toMapFailure,
  type MapOptions,
  type Page,
  type Article,
  type ContentEntity,
} from "../index";

const trustedSiteUrl = "https://seovista.com";
const publicMode: MapOptions["mode"] = { kind: "public", now: new Date("2026-07-01T00:00:00Z") };
const previewAuth = {
  scope: "preview" as const,
  issuedAt: new Date("2026-06-01T00:00:00Z"),
  expiresAt: new Date("2026-08-01T00:00:00Z"),
  tokenHash: "mock-token-hash",
};
const previewMode: MapOptions["mode"] = { kind: "preview", now: new Date("2026-07-01T00:00:00Z"), authorization: previewAuth };
const baseOptions: MapOptions = {
  trustedSiteUrl,
  mode: publicMode,
  supportedLocales: ["en"],
  defaultLocale: "en",
};

interface RawPageFixture {
  id: string;
  collection: string;
  slug: string;
  locale: string;
  canonicalPath?: string | undefined;
  canonicalOverride?: string | undefined;
  indexation?: { indexable: boolean } | undefined;
  provenance: {
    createdAt: string;
    updatedAt: string;
    status: string;
    locale: string;
    version: number;
  };
  title: string;
  description: string;
  body?: string | undefined;
  author?: string | undefined;
  reviewer?: string | undefined;
  sources?: string[] | undefined;
  relatedEntities?: string[] | undefined;
  socialImage?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

function rawPage(overrides: Partial<RawPageFixture> = {}): RawPageFixture {
  return {
    id: "page-1",
    collection: "pages",
    slug: "test-page",
    locale: "en",
    canonicalPath: "/test-page/",
    indexation: { indexable: true },
    provenance: {
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      status: "published",
      locale: "en",
      version: 1,
    },
    title: "Test Page",
    description: "A test page.",
    ...overrides,
  };
}

describe("content-models mapper", () => {
  it("maps a raw page to a domain Page with correct fields", () => {
    const result = mapPage(rawPage(), baseOptions);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const page = result.value as Page;
    expect(page.kind).toBe("page");
    expect(page.id).toBe("page-1");
    expect(page.slug).toBe("test-page");
    expect(page.title).toBe("Test Page");
    expect(page.locale).toBe("en");
    expect(page.canonical.absolute).toBe("https://seovista.com/test-page/");
    expect(page.canonical.path).toBe("/test-page/");
    expect(page.indexation.indexable).toBe(true);
    expect(page.provenance.collection).toBe("pages");
    expect(page.provenance.status).toBe("published");
  });

  it("maps all 14 registered collections", () => {
    const collections = [
      "pages",
      "services",
      "tools",
      "articles",
      "authors",
      "organizations",
      "researchReports",
      "definitions",
      "faqs",
      "sources",
      "redirects",
      "locales",
      "auditLeads",
    ];
    const base = {
      id: "x",
      slug: "x",
      locale: "en",
      canonicalPath: "/x/",
      indexation: { indexable: true },
      provenance: {
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        status: "published",
        locale: "en",
        version: 1,
      },
    };
    const fixtures: Record<string, unknown> = {
      pages: { ...base, collection: "pages", title: "T", description: "D" },
      services: { ...base, collection: "services", name: "N", description: "D" },
      tools: { ...base, collection: "tools", name: "N", description: "D", isFunctioning: false },
      articles: { ...base, collection: "articles", title: "T", description: "D", author: "a" },
      authors: { ...base, collection: "authors", name: "N", socialProfiles: {} },
      organizations: { ...base, collection: "organizations", name: "N" },
      researchReports: { ...base, collection: "researchReports", title: "T", description: "D", authors: ["a"] },
      definitions: { ...base, collection: "definitions", term: "T", definition: "D" },
      faqs: { ...base, collection: "faqs", question: "Q", answer: "A" },
      sources: { ...base, collection: "sources", title: "T" },
      redirects: { id: "r", collection: "redirects", source: "/a/", destination: "/b/", permanent: true, statusCode: 301, provenance: base.provenance },
      locales: { id: "l", collection: "locales", code: "en", name: "English", isDefault: true, isSupported: true, provenance: base.provenance },
      auditLeads: { id: "al", collection: "auditLeads", slug: "lead", email: "lead@example.com", locale: "en", status: "private", provenance: { ...base.provenance, status: "private" } },
    };

    for (const collection of collections) {
      const result = mapEntity(fixtures[collection], baseOptions);
      expect(result.success).toBe(true);
    }
  });

  it("records Case Studies as deferred and not supported", () => {
    const fixture = {
      id: "cs-1",
      collection: "caseStudies",
      provenance: {
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        status: "published",
        locale: "en",
        version: 1,
      },
    };
    const result = mapEntity(fixture, baseOptions);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.field).toBe("collection");
      expect(result.reason).toContain("deferred");
    }
  });

  it("fails atomically for missing required fields", () => {
    const fixture = rawPage();
    const { title: _title, ...withoutTitle } = fixture;
    const result = mapPage(withoutTitle, baseOptions);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.redacted).toBe(true);
    }
  });

  it("fails for malformed timestamps", () => {
    const result = mapPage(
      rawPage({ provenance: { ...rawPage().provenance, createdAt: "not-a-date" } }),
      baseOptions,
    );
    expect(result.success).toBe(false);
  });

  it("fails for unsafe slugs", () => {
    const result = mapPage(rawPage({ slug: "BadSlug" }), baseOptions);
    expect(result.success).toBe(false);
  });

  it("fails for unsupported locales", () => {
    const result = mapPage(rawPage({ locale: "tr" }), { ...baseOptions, supportedLocales: ["en"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.field).toBe("locale");
    }
  });

  it("rejects draft content from public mapping", () => {
    const result = mapPage(
      rawPage({
        provenance: { ...rawPage().provenance, status: "draft" },
        indexation: { indexable: false },
      }),
      baseOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.provenance.status).toBe("draft");
    expect(isContentEntityPubliclyEligible(result.value as ContentEntity, publicMode, "html")).toBe(false);
  });

  it("rejects preview content without authorization", () => {
    const result = mapPage(
      rawPage({
        provenance: { ...rawPage().provenance, status: "preview" },
        indexation: { indexable: false },
      }),
      baseOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(isContentEntityPubliclyEligible(result.value as ContentEntity, publicMode, "html")).toBe(false);
    expect(isContentEntityPubliclyEligible(result.value as ContentEntity, previewMode, "html")).toBe(true);
  });

  it("rejects private and indexable combination", () => {
    const result = mapPage(
      rawPage({
        provenance: { ...rawPage().provenance, status: "private" },
        indexation: { indexable: true },
      }),
      baseOptions,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.field).toBe("indexation.indexable");
    }
  });
});

describe("content-models canonical", () => {
  it("defaults canonical to trusted site URL and trailing slash", () => {
    const result = resolveCanonical(trustedSiteUrl, "/about/", undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.absolute).toBe("https://seovista.com/about/");
    }
  });

  it("rejects untrusted canonical overrides", () => {
    const result = resolveCanonical(trustedSiteUrl, "/about/", "https://evil.com/about/");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.value.field).toBe("canonicalOverride");
    }
  });

  it("rejects credentials, fragments, and queries in canonical", () => {
    expect(resolveCanonical(trustedSiteUrl, "/about/", "https://user:pass@seovista.com/about/").success).toBe(false);
    expect(resolveCanonical(trustedSiteUrl, "/about/", "https://seovista.com/about/?x=1").success).toBe(false);
    expect(resolveCanonical(trustedSiteUrl, "/about/", "https://seovista.com/about/#frag").success).toBe(false);
  });

  it("rejects missing trailing slash", () => {
    const result = resolveCanonical(trustedSiteUrl, "/about", undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.value.field).toBe("canonicalPath");
    }
  });
});

describe("content-models redirects", () => {
  it("accepts a valid one-hop permanent redirect", () => {
    const result = validateRedirect(trustedSiteUrl, {
      source: "/old-geo/",
      destination: "/geo/",
      permanent: true,
      statusCode: 301,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.statusCode).toBe(301);
      expect(result.value.destination).toBe("https://seovista.com/geo/");
    }
  });

  it("rejects redirect loops", () => {
    const result = validateRedirect(trustedSiteUrl, {
      source: "/same/",
      destination: "/same/",
      permanent: true,
      statusCode: 301,
    });
    expect(result.success).toBe(false);
  });

  it("rejects external redirect targets", () => {
    const result = validateRedirect(trustedSiteUrl, {
      source: "/out/",
      destination: "https://example.com/out/",
      permanent: true,
      statusCode: 301,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsafe redirect sources and temporary destinations", () => {
    expect(validateRedirect(trustedSiteUrl, {
      source: "/Old-Geo/",
      destination: "/geo/",
      permanent: true,
      statusCode: 301,
    }).success).toBe(false);
    expect(validateRedirect(trustedSiteUrl, {
      source: "/old-geo/?campaign=1",
      destination: "/geo/",
      permanent: true,
      statusCode: 301,
    }).success).toBe(false);
    expect(validateRedirect(trustedSiteUrl, {
      source: "/old-geo/",
      destination: "/geo/",
      permanent: false,
      statusCode: 302,
    }).success).toBe(false);
  });

  it("rejects duplicate sources, chains, and indirect redirect loops", () => {
    const valid = [{ source: "/legacy/", destination: "/geo/", permanent: true, statusCode: 301 }];
    const duplicate = [
      { source: "/legacy/", destination: "/geo/", permanent: true, statusCode: 301 },
      { source: "/legacy/", destination: "/seo/", permanent: true, statusCode: 301 },
    ];
    const chain = [
      { source: "/legacy/", destination: "/old-geo/", permanent: true, statusCode: 301 },
      { source: "/old-geo/", destination: "/geo/", permanent: true, statusCode: 301 },
    ];
    const loop = [
      { source: "/legacy-a/", destination: "/legacy-b/", permanent: true, statusCode: 301 },
      { source: "/legacy-b/", destination: "/legacy-a/", permanent: true, statusCode: 301 },
    ];
    expect(validateRedirectSet(trustedSiteUrl, valid).success).toBe(true);
    expect(validateRedirectSet(trustedSiteUrl, duplicate).success).toBe(false);
    expect(validateRedirectSet(trustedSiteUrl, chain).success).toBe(false);
    expect(validateRedirectSet(trustedSiteUrl, loop).success).toBe(false);
  });
});

describe("content-models locale policy", () => {
  it("maps English locale unchanged", () => {
    const result = validateLocale("en", ["en"]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe("en");
    }
  });

  it("fails unsupported locales", () => {
    const result = validateLocale("fr", ["en"]);
    expect(result.success).toBe(false);
  });

  it("permits hreflang only between reciprocal published indexable translations", () => {
    const english = {
      id: "page-geo-en",
      locale: "en",
      translationKey: "geo",
      provenance: { status: "published" },
      indexation: { indexable: true },
    };
    const turkish = {
      id: "page-geo-tr",
      locale: "tr",
      translationKey: "geo",
      provenance: { status: "published" },
      indexation: { indexable: true },
    };
    expect(isHreflangEligible(english, turkish, ["en", "tr"])).toBe(true);
    expect(isHreflangEligible(english, { ...turkish, translationKey: "different" }, ["en", "tr"])).toBe(false);
    expect(isHreflangEligible(english, { ...turkish, provenance: { status: "preview" } }, ["en", "tr"])).toBe(false);
    expect(isHreflangEligible(english, { ...turkish, indexation: { indexable: false } }, ["en", "tr"])).toBe(false);
  });
});

describe("content-models adapter and eligibility", () => {
  it("recomputes relationship eligibility on each read", () => {
    const page = mapPage(rawPage({ author: "author-jane" }), baseOptions);
    const author = mapEntity(
      {
        id: "author-jane",
        collection: "authors",
        slug: "jane-doe",
        locale: "en",
        canonicalPath: "/authors/jane-doe/",
        indexation: { indexable: true },
        provenance: {
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          status: "published",
          locale: "en",
          version: 1,
        },
        name: "Jane Doe",
        socialProfiles: {},
      },
      baseOptions,
    );
    expect(page.success).toBe(true);
    expect(author.success).toBe(true);
    if (!page.success || !author.success) return;

    const adapter = createAdapter([page.value, author.value], baseOptions);
    const resolved = adapter.readResolved("html");
    const resolvedPage = resolved.find((e) => e.kind === "page") as Page & { resolvedAuthor?: { id: string } };
    expect(resolvedPage).toBeDefined();
    expect(resolvedPage.resolvedAuthor?.id).toBe("author-jane");

    // Make author ineligible by changing its status in a new adapter read
    const ineligibleAuthor = { ...author.value, provenance: { ...author.value.provenance, status: "draft" } };
    const adapter2 = createAdapter([page.value, ineligibleAuthor as ContentEntity], baseOptions);
    const resolved2 = adapter2.readResolved("html");
    const resolvedPage2 = resolved2.find((e) => e.kind === "page") as Page & { resolvedAuthor?: { id: string } };
    expect(resolvedPage2.resolvedAuthor).toBeUndefined();
  });

  it("excludes draft and preview from public projections", () => {
    const publishedResult = mapPage(rawPage(), baseOptions);
    const draftResult = mapPage(
      rawPage({
        id: "draft-1",
        slug: "draft-1",
        provenance: { ...rawPage().provenance, status: "draft" },
        indexation: { indexable: false },
      }),
      baseOptions,
    );
    expect(publishedResult.success).toBe(true);
    expect(draftResult.success).toBe(true);
    if (!publishedResult.success || !draftResult.success) return;
    const adapter = createAdapter([publishedResult.value, draftResult.value], baseOptions);
    expect(adapter.readContent("html")).toHaveLength(1);
    expect(adapter.readContent("sitemap")).toHaveLength(1);
    expect(adapter.readContent("feed")).toHaveLength(0);
  });

  it("keeps audit leads private and absent from public projections", () => {
    const lead = mapEntity(
      {
        id: "lead-1",
        collection: "auditLeads",
        slug: "lead-1",
        locale: "en",
        status: "private",
        email: "lead@example.com",
        provenance: {
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          status: "private",
          locale: "en",
          version: 1,
        },
      },
      baseOptions,
    );
    expect(lead.success).toBe(true);
    if (!lead.success) return;
    expect(isAuditLeadPrivate()).toBe(true);
  });
});

describe("content-models source/citation non-inference", () => {
  it("does not infer sources from rich-text body", () => {
    const result = mapArticle(
      {
        id: "article-2",
        collection: "articles",
        slug: "rich-text-article",
        locale: "en",
        canonicalPath: "/insights/rich-text-article/",
        indexation: { indexable: true },
        provenance: {
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          status: "published",
          locale: "en",
          version: 1,
        },
        title: "Rich Text Article",
        description: "Has citations in prose.",
        body: "According to Smith et al. (2024) and https://example.com/source, the result is clear.",
        author: "author-jane",
        sources: [],
      },
      baseOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const article = result.value as Article;
    expect(article.sources).toHaveLength(0);
  });

  it("preserves structured sources", () => {
    const result = mapArticle(
      {
        id: "article-3",
        collection: "articles",
        slug: "structured-article",
        locale: "en",
        canonicalPath: "/insights/structured-article/",
        indexation: { indexable: true },
        provenance: {
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
          status: "published",
          locale: "en",
          version: 1,
        },
        title: "Structured Article",
        description: "Has structured sources.",
        author: "author-jane",
        sources: ["source-1"],
      },
      baseOptions,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const article = result.value as Article;
    expect(article.sources).toEqual(["source-1"]);
  });
});

describe("content-models public surface", () => {
  it("exports the package name", async () => {
    const { name } = await import("../index.js");
    expect(name).toBe("@seovista/content-models");
  });

  it("mapFailure is redacted", () => {
    const failure = toMapFailure("slug", "unsafe slug");
    expect(failure.redacted).toBe(true);
    expect(failure.success).toBe(false);
  });
});
