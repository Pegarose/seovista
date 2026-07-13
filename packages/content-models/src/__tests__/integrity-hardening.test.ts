import { describe, expect, it } from "vitest";
import {
  SPRINT_ZERO_COLLECTION_MATRIX,
  createAdapter,
  mapCollectionEnvelope,
  mapEntity,
  mapPage,
  validateSprintZeroRegistration,
  type ContentEntity,
  type MapOptions,
} from "../index";

const options: MapOptions = {
  trustedSiteUrl: "https://seovista.com",
  mode: { kind: "public", now: new Date("2026-07-13T00:00:00.000Z") },
  supportedLocales: ["en"],
  defaultLocale: "en",
};

function rawPage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "page-1",
    collection: "pages",
    slug: "integrity-page",
    locale: "en",
    canonicalPath: "/integrity-page/",
    indexation: { indexable: true, includeInSitemap: true, includeInFeed: false, includeInJsonLd: true },
    provenance: {
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
      status: "published",
      locale: "en",
      version: 1,
    },
    title: "Integrity Page",
    description: "A page used only for contract-integrity tests.",
    ...overrides,
  };
}

function rawAuthor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "author-1",
    collection: "authors",
    slug: "integrity-author",
    locale: "en",
    canonicalPath: "/authors/integrity-author/",
    indexation: { indexable: true },
    provenance: {
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
      status: "published",
      locale: "en",
      version: 1,
    },
    name: "Integrity Author",
    socialProfiles: {},
    ...overrides,
  };
}

function mapped(raw: Record<string, unknown>): ContentEntity {
  const result = mapEntity(raw, options);
  if (!result.success || result.value.kind === "redirect" || result.value.kind === "locale" || result.value.kind === "auditLead") {
    throw new Error("Expected a content entity fixture to map.");
  }
  return result.value;
}

describe("Sprint 0 content contract matrix", () => {
  it("declares exactly the thirteen supported collections and defers Case Studies", () => {
    expect(Object.keys(SPRINT_ZERO_COLLECTION_MATRIX)).toEqual([
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
    ]);
    expect(SPRINT_ZERO_COLLECTION_MATRIX.auditLeads.visibility).toBe("private");
    expect(SPRINT_ZERO_COLLECTION_MATRIX.articles.relationships.author).toMatchObject({ required: true, targetKinds: ["author"], cardinality: "one" });
    // @ts-expect-error Case Studies are deliberately outside the supported Sprint 0 matrix.
    expect(SPRINT_ZERO_COLLECTION_MATRIX.caseStudies).toBeUndefined();
  });

  it("rejects incomplete, duplicate, unsupported, and deferred collection registrations", () => {
    expect(validateSprintZeroRegistration(Object.keys(SPRINT_ZERO_COLLECTION_MATRIX)).success).toBe(true);
    expect(validateSprintZeroRegistration(["pages", "pages"]).success).toBe(false);
    expect(validateSprintZeroRegistration(["unknown"]).success).toBe(false);
    expect(validateSprintZeroRegistration(["caseStudies"]).success).toBe(false);
  });
});

describe("strict raw collection envelope mapping", () => {
  it("rejects unknown raw fields with a field-specific redacted failure", () => {
    const result = mapPage(rawPage({ unapprovedTransportField: "canary" }), options);
    expect(result).toEqual(expect.objectContaining({ success: false, field: "pages", redacted: true }));
  });

  it("rejects reversed provenance and editorial timestamps atomically", () => {
    const reversedProvenance = mapPage(rawPage({
      provenance: {
        createdAt: "2026-07-11T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
        status: "published",
        locale: "en",
        version: 1,
      },
    }), options);
    const reversedEditorial = mapPage(rawPage({
      publishedAt: "2026-07-11T00:00:00.000Z",
      modifiedAt: "2026-07-10T00:00:00.000Z",
    }), options);
    expect(reversedProvenance).toEqual(expect.objectContaining({ success: false, field: "provenance.updatedAt", redacted: true }));
    expect(reversedEditorial).toEqual(expect.objectContaining({ success: false, field: "modifiedAt", redacted: true }));
  });

  it("rejects malformed structured source references without inferring replacements", () => {
    const result = mapPage(rawPage({ sources: ["source-1", ""] }), options);
    expect(result).toEqual(expect.objectContaining({ success: false, field: "pages.sources.1", redacted: true }));
  });

  it("rejects unknown envelope fields and emits no mapped records", () => {
    const result = mapCollectionEnvelope({
      collection: "pages",
      mode: "public",
      locale: "en",
      items: [rawPage()],
      total: 1,
      generatedAt: "2026-07-10T00:00:00.000Z",
      leakedTransportField: true,
    }, options);
    expect(result).toEqual(expect.objectContaining({ success: false, field: "envelope", redacted: true }));
  });

  it("rejects wrong envelope item discriminators and totals atomically", () => {
    const wrongItem = mapCollectionEnvelope({
      collection: "pages",
      mode: "public",
      locale: "en",
      items: [rawAuthor()],
      total: 1,
      generatedAt: "2026-07-10T00:00:00.000Z",
    }, options);
    const wrongTotal = mapCollectionEnvelope({
      collection: "pages",
      mode: "public",
      locale: "en",
      items: [rawPage()],
      total: 2,
      generatedAt: "2026-07-10T00:00:00.000Z",
    }, options);
    expect(wrongItem).toEqual(expect.objectContaining({ success: false, field: "items[0].collection", redacted: true }));
    expect(wrongTotal).toEqual(expect.objectContaining({ success: false, field: "total", redacted: true }));
  });

  it("rejects partial collection output rather than returning mapped successes", () => {
    const result = mapCollectionEnvelope({
      collection: "pages",
      mode: "public",
      locale: "en",
      items: [rawPage(), rawPage({ id: "page-2", slug: "other-page", title: undefined })],
      total: 2,
      generatedAt: "2026-07-10T00:00:00.000Z",
    }, options);
    expect(result).toEqual(expect.objectContaining({ success: false, field: "items[1]", redacted: true }));
  });
});

describe("relationship integrity", () => {
  it("fails an article closed when its required author has the wrong target kind", () => {
    const article = mapped({
      ...rawPage({ id: "article-1", collection: "articles", slug: "integrity-article", title: "Integrity Article", author: "page-1" }),
      description: "An article relationship integrity fixture.",
    });
    const page = mapped(rawPage());
    const adapter = createAdapter([article, page], options);
    expect(adapter.readResolved("html").some((entity) => entity.id === article.id)).toBe(false);
  });

  it("omits an optional wrong-kind relation and retains a stable redacted diagnostic", () => {
    const page = mapped(rawPage({ author: "source-1" }));
    const source = mapped({
      id: "source-1",
      collection: "sources",
      slug: "integrity-source",
      locale: "en",
      canonicalPath: "/sources/integrity-source/",
      indexation: { indexable: true },
      provenance: {
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
        status: "published",
        locale: "en",
        version: 1,
      },
      title: "Integrity Source",
    });
    const adapter = createAdapter([page, source], options);
    const resolved = adapter.readResolved("html").find((entity) => entity.id === page.id);
    expect(resolved).toEqual(expect.objectContaining({ resolvedAuthor: undefined }));
    expect((resolved as { relationshipDiagnostics?: unknown } | undefined)?.relationshipDiagnostics).toEqual([
      { field: "author", code: "wrong_target_kind", redacted: true },
    ]);
  });

  it("recomputes optional relationship eligibility on every projection read without stale identity", () => {
    const page = mapped(rawPage({ author: "author-1" }));
    const author = mapped(rawAuthor());
    const before = createAdapter([page, author], options).readResolved("html").find((entity) => entity.id === page.id);
    const after = createAdapter([
      page,
      { ...author, provenance: { ...author.provenance, status: "draft" } } as ContentEntity,
    ], options).readResolved("html").find((entity) => entity.id === page.id);
    expect(before).toEqual(expect.objectContaining({ resolvedAuthor: expect.objectContaining({ id: "author-1" }) }));
    expect(after).toEqual(expect.objectContaining({ resolvedAuthor: undefined }));
    expect((after as { relationshipDiagnostics?: unknown } | undefined)?.relationshipDiagnostics).toEqual([
      { field: "author", code: "ineligible_target", redacted: true },
    ]);
  });

  it("honors feed, sitemap, and JSON-LD inclusion flags for every fresh projection read", () => {
    const entity = mapped(rawPage({
      indexation: { indexable: true, includeInSitemap: false, includeInFeed: false, includeInJsonLd: false },
    }));
    const adapter = createAdapter([entity], options);
    expect(adapter.readContent("html")).toHaveLength(1);
    expect(adapter.readContent("sitemap")).toHaveLength(0);
    expect(adapter.readContent("feed")).toHaveLength(0);
    expect(adapter.readContent("jsonLd")).toHaveLength(0);
    expect(adapter.readContent("llms")).toHaveLength(1);
  });
});
