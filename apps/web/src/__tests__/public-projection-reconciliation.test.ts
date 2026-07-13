import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAdapter,
  type ContentEntity,
  type MapOptions,
  type Page,
  type FAQ,
} from "@seovista/content-models";
import { buildPublicProjectionMatrix } from "../content/public-projections";
import { buildFeedBody } from "../../app/feed.xml/route";
import { buildLlmsBody } from "../../app/llms.txt/route";
import { buildSitemapBody } from "../../app/sitemap.xml/route";
import { publicFeedContent, publicLlmsContent, publicSitemapContent } from "../content/site";

const siteUrl = "https://seovista.com";
const fixedNow = "2026-07-13T00:00:00.000Z";
const options: MapOptions = {
  trustedSiteUrl: siteUrl,
  mode: { kind: "public", now: new Date(fixedNow) },
  supportedLocales: ["en"],
  defaultLocale: "en",
};

const dependencyTable = {
  title: ["html", "metadata", "jsonLd", "feed", "llms"],
  description: ["html", "metadata", "jsonLd", "feed"],
  canonical: ["html", "metadata", "jsonLd", "sitemap", "feed", "llms"],
  modifiedAt: ["jsonLd", "sitemap", "feed"],
  visibleFaq: ["html", "jsonLd"],
  indexation: ["metadata", "sitemap", "feed", "llms"],
} as const;

function page(id: string, overrides: Partial<Page> = {}): Page {
  const slug = id.replace(/^page-/, "");
  return {
    kind: "page",
    id,
    slug,
    locale: "en",
    canonical: { path: `/${slug}/`, absolute: `${siteUrl}/${slug}/` },
    indexation: {
      indexable: true,
      followLinks: true,
      includeInSitemap: true,
      includeInFeed: true,
      includeInJsonLd: true,
    },
    provenance: {
      rawId: id,
      collection: "pages",
      locale: "en",
      status: "published",
      createdAt: fixedNow,
      updatedAt: fixedNow,
      version: 1,
    },
    title: `${slug} title`,
    description: `${slug} description`,
    body: `${slug} body`,
    publishedAt: fixedNow,
    modifiedAt: fixedNow,
    sources: [],
    relatedEntities: [],
    ...overrides,
  };
}

function faq(overrides: Partial<FAQ> = {}): FAQ {
  return {
    kind: "faq",
    id: "faq-visible",
    slug: "faq-visible",
    locale: "en",
    canonical: { path: "/faq-visible/", absolute: `${siteUrl}/faq-visible/` },
    indexation: {
      indexable: true,
      followLinks: true,
      includeInSitemap: false,
      includeInFeed: false,
      includeInJsonLd: true,
    },
    provenance: {
      rawId: "faq-visible",
      collection: "faqs",
      locale: "en",
      status: "published",
      createdAt: fixedNow,
      updatedAt: fixedNow,
      version: 1,
    },
    question: "What is visible?",
    answer: "This FAQ answer is visible in the HTML projection.",
    ...overrides,
  };
}

function projectionDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildSurfaceDigests(entities: readonly ContentEntity[]): Record<string, string> {
  const adapter = createAdapter(entities, options);
  const matrix = buildPublicProjectionMatrix({ adapter, siteUrl, now: fixedNow });
  return Object.fromEntries(
    Object.entries(matrix).map(([surface, output]) => [surface, projectionDigest(output)])
  );
}

function changedSurfaces(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(before).filter((surface) => before[surface] !== after[surface]);
}

function surfaceIdentityTable(
  matrix: ReturnType<typeof buildPublicProjectionMatrix>
): Record<string, readonly string[]> {
  return {
    html: matrix.html.map((value) => value.match(/data-content-id="([^"]+)"/)?.[1] ?? ""),
    metadata: matrix.metadata.map((value) => JSON.parse(value).canonical),
    jsonLd: matrix.jsonLd.map((value) => JSON.parse(value)["@graph"][0]["@id"]),
    sitemap: Array.from(matrix.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1] ?? ""),
    feed: Array.from(matrix.feed.matchAll(/<id>([^<]+)<\/id>/g), (match) => match[1] ?? "").filter(
      (id) => id !== `${siteUrl}/feed.xml`
    ),
    llms: Array.from(
      matrix.llms.matchAll(/^- (https:\/\/[^\s]+)/gm),
      (match) => match[1] ?? ""
    ).filter((url) => url !== `${siteUrl}/`),
  };
}

function assertNoMarkers(value: unknown, markers: readonly string[]): void {
  const serialized = JSON.stringify(value);
  for (const marker of markers) {
    expect(serialized).not.toContain(marker);
  }
}

/**
 * VAL-CROSS-001 and VAL-CROSS-004 evidence:
 * - `eligibilityTable` is the mixed eligibility matrix.
 * - `dependencyTable` is the explicit field-to-projection matrix.
 * - SHA-256 surface digests prove causal changes and unrelated stability.
 */
describe("VAL-CROSS-001: public projection eligibility reconciliation", () => {
  const published = page("page-published");
  const noindex = page("page-noindex", {
    indexation: {
      indexable: false,
      followLinks: false,
      includeInSitemap: false,
      includeInFeed: false,
      includeInJsonLd: true,
    },
  });
  const draft = page("page-draft", {
    provenance: { ...published.provenance, rawId: "page-draft", status: "draft" },
    indexation: { ...published.indexation, indexable: false },
  });
  const preview = page("page-preview", {
    provenance: { ...published.provenance, rawId: "page-preview", status: "preview" },
    indexation: { ...published.indexation, indexable: false },
  });
  const invalidCanonical = page("page-invalid-canonical", {
    canonical: {
      path: "/invalid-canonical/",
      absolute: "https://invalid.example/invalid-canonical/",
    },
  });
  const invalidLocale = page("page-invalid-locale", { locale: "tr" });
  const hiddenFaq = faq({ provenance: { ...faq().provenance, status: "draft" } });

  const entities = [
    published,
    noindex,
    draft,
    preview,
    invalidCanonical,
    invalidLocale,
    faq(),
    hiddenFaq,
  ];
  const adapter = createAdapter(entities, options);
  const matrix = buildPublicProjectionMatrix({ adapter, siteUrl, now: fixedNow });

  const eligibilityTable = {
    published: ["html", "metadata", "jsonLd", "sitemap", "feed", "llms"],
    noindex: ["html", "metadata", "jsonLd"],
    draft: [],
    preview: [],
    invalidCanonical: [],
    invalidLocale: [],
    visibleFaq: ["html", "metadata", "jsonLd", "llms"],
    hiddenFaq: [],
  } as const;

  it("reconciles each mixed identity against the explicit six-surface eligibility table", () => {
    const identities = surfaceIdentityTable(matrix);

    expect(eligibilityTable).toEqual({
      published: ["html", "metadata", "jsonLd", "sitemap", "feed", "llms"],
      noindex: ["html", "metadata", "jsonLd"],
      draft: [],
      preview: [],
      invalidCanonical: [],
      invalidLocale: [],
      visibleFaq: ["html", "metadata", "jsonLd", "llms"],
      hiddenFaq: [],
    });

    expect(identities.html).toContain("page-published");
    expect(identities.html).toContain("page-noindex");
    expect(identities.html).toContain("faq-visible");
    expect(identities.metadata).toContain(`${siteUrl}/published/`);
    expect(identities.metadata).toContain(`${siteUrl}/noindex/`);
    expect(identities.jsonLd).toContain(`${siteUrl}/published/`);
    expect(identities.jsonLd).toContain(`${siteUrl}/noindex/`);
    expect(identities.sitemap).toContain(`${siteUrl}/published/`);
    expect(identities.feed).toContain(`${siteUrl}/published/`);
    expect(identities.llms).toContain(`${siteUrl}/published/`);

    expect(identities.sitemap).not.toContain(`${siteUrl}/noindex/`);
    expect(identities.llms).not.toContain(`${siteUrl}/noindex/`);
    expect(identities.feed).not.toContain(`${siteUrl}/noindex/`);
  });

  it("completely scans every individual surface for unpublished, invalid, and hidden markers", () => {
    const markers = [
      "page-draft",
      "page-preview",
      "page-invalid-canonical",
      "page-invalid-locale",
      "faq-hidden",
    ];
    for (const [surface, value] of Object.entries(matrix)) {
      assertNoMarkers(value, markers);
      expect(JSON.stringify(value), surface).not.toContain("invalid.example");
      expect(JSON.stringify(value), surface).not.toContain('"locale":"tr"');
    }
  });
});

describe("production discovery builders", () => {
  it("derive sitemap, feed, and llms output from their matching adapter projections", () => {
    const sitemapContent = publicSitemapContent();
    const feedContent = publicFeedContent();
    const llmsContent = publicLlmsContent();
    const sitemap = buildSitemapBody();
    const feed = buildFeedBody();
    const llms = buildLlmsBody();

    for (const page of sitemapContent) {
      expect(sitemap).toContain(page.canonical.absolute);
    }
    for (const entity of feedContent) {
      expect(feed).toContain(entity.canonical.absolute);
    }
    for (const page of llmsContent) {
      expect(llms).toContain(page.canonical.absolute);
    }
  });

  it("is deterministic across repeated discovery reads", () => {
    expect(buildSitemapBody()).toBe(buildSitemapBody());
    expect(buildFeedBody()).toBe(buildFeedBody());
    expect(buildLlmsBody()).toBe(buildLlmsBody());
  });
});

describe("VAL-CROSS-004: causal public projection mutations", () => {
  const unrelated = page("page-unrelated");
  const original = page("page-subject");

  it("has explicit dependency rows for every supported mutation", () => {
    expect(dependencyTable).toEqual({
      title: ["html", "metadata", "jsonLd", "feed", "llms"],
      description: ["html", "metadata", "jsonLd", "feed"],
      canonical: ["html", "metadata", "jsonLd", "sitemap", "feed", "llms"],
      modifiedAt: ["jsonLd", "sitemap", "feed"],
      visibleFaq: ["html", "jsonLd"],
      indexation: ["metadata", "sitemap", "feed", "llms"],
    });
  });

  it.each([
    ["title", { title: "subject title changed" }],
    ["description", { description: "subject description changed" }],
    [
      "canonical",
      { canonical: { path: "/subject-renamed/", absolute: `${siteUrl}/subject-renamed/` } },
    ],
    ["modifiedAt", { modifiedAt: "2026-07-14T00:00:00.000Z" }],
  ] as const)("changes only documented projection digests when %s changes", (field, overrides) => {
    const before = buildSurfaceDigests([original, unrelated]);
    const after = buildSurfaceDigests([{ ...original, ...overrides }, unrelated]);
    expect(changedSurfaces(before, after).sort()).toEqual([...dependencyTable[field]].sort());
  });

  it("changes HTML and JSON-LD only when a visible FAQ changes", () => {
    const before = buildSurfaceDigests([original, unrelated, faq()]);
    const after = buildSurfaceDigests([
      original,
      unrelated,
      faq({ answer: "Changed visible answer." }),
    ]);
    expect(changedSurfaces(before, after).sort()).toEqual([...dependencyTable.visibleFaq].sort());
  });

  it("changes metadata, sitemap, and feed only when indexation becomes noindex", () => {
    const before = buildSurfaceDigests([original, unrelated]);
    const after = buildSurfaceDigests([
      {
        ...original,
        indexation: {
          ...original.indexation,
          indexable: false,
          includeInSitemap: false,
          includeInFeed: false,
        },
      },
      unrelated,
    ]);
    expect(changedSurfaces(before, after).sort()).toEqual([...dependencyTable.indexation].sort());
  });

  it("is deterministic across repeated reads and cannot return stale output after an ineligible mutation", () => {
    const before = buildSurfaceDigests([original, unrelated]);
    expect(buildSurfaceDigests([original, unrelated])).toEqual(before);

    const after = buildSurfaceDigests([
      {
        ...original,
        provenance: { ...original.provenance, status: "draft" },
        indexation: { ...original.indexation, indexable: false },
      },
      unrelated,
    ]);
    expect(after).not.toEqual(before);
    const matrix = buildPublicProjectionMatrix({
      adapter: createAdapter(
        [
          {
            ...original,
            provenance: { ...original.provenance, status: "draft" },
            indexation: { ...original.indexation, indexable: false },
          },
          unrelated,
        ],
        options
      ),
      siteUrl,
      now: fixedNow,
    });
    expect(JSON.stringify(matrix)).not.toContain("page-subject");
    expect(JSON.stringify(matrix)).toContain("page-unrelated");
  });
});
