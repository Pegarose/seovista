import type {
  Page,
  Service,
  Tool,
  Article,
  Author,
  Organization,
  Definition,
  FAQ,
} from "@seovista/content-models";

const siteUrl = "https://seovista.com";

export const baseProvenance = {
  rawId: "raw-1",
  collection: "pages" as const,
  locale: "en",
  status: "published" as const,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  version: 1,
};

export const baseIndexation = {
  indexable: true,
  followLinks: true,
  includeInSitemap: true,
  includeInFeed: false,
  includeInJsonLd: true,
};

export function makePage(overrides: Partial<Page> = {}): Page {
  return {
    kind: "page",
    id: "page-1",
    slug: "test-page",
    locale: "en",
    canonical: { path: "/test-page/", absolute: `${siteUrl}/test-page/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance },
    title: "Test Page",
    description: "A test page description.",
    sources: [],
    relatedEntities: [],
    ...overrides,
  } as Page;
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    kind: "service",
    id: "service-1",
    slug: "geo",
    locale: "en",
    canonical: { path: "/geo/", absolute: `${siteUrl}/geo/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "services" },
    name: "GEO Readiness",
    description: "A GEO readiness service.",
    sources: [],
    relatedEntities: [],
    ...overrides,
  } as Service;
}

export function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    kind: "tool",
    id: "tool-1",
    slug: "geo-readiness-checker",
    locale: "en",
    canonical: { path: "/tools/geo-readiness-checker/", absolute: `${siteUrl}/tools/geo-readiness-checker/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "tools" },
    name: "GEO Readiness Checker",
    description: "A non-operational checker.",
    isFunctioning: false,
    sources: [],
    relatedEntities: [],
    ...overrides,
  } as Tool;
}

export function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    kind: "article",
    id: "article-1",
    slug: "sample-article",
    locale: "en",
    canonical: { path: "/insights/sample-article/", absolute: `${siteUrl}/insights/sample-article/` },
    indexation: { ...baseIndexation, includeInFeed: true },
    provenance: { ...baseProvenance, collection: "articles" },
    title: "Sample Article",
    description: "An article description.",
    author: "author-1",
    sources: [],
    ...overrides,
  } as Article;
}

export function makeAuthor(overrides: Partial<Author> = {}): Author {
  return {
    kind: "author",
    id: "author-1",
    slug: "jane-doe",
    locale: "en",
    canonical: { path: "/authors/jane-doe/", absolute: `${siteUrl}/authors/jane-doe/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "authors" },
    name: "Jane Doe",
    socialProfiles: {},
    ...overrides,
  } as Author;
}

export function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    kind: "organization",
    id: "org-1",
    slug: "seovista",
    locale: "en",
    canonical: { path: "/", absolute: `${siteUrl}/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "organizations" },
    name: "SeoVista",
    parentOrganization: "GMedya Group",
    ...overrides,
  } as Organization;
}

export function makeDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    kind: "definition",
    id: "def-1",
    slug: "geo",
    locale: "en",
    canonical: { path: "/definitions/geo/", absolute: `${siteUrl}/definitions/geo/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "definitions" },
    term: "GEO",
    definition: "Generative Engine Optimization.",
    sources: [],
    relatedTerms: [],
    ...overrides,
  } as Definition;
}

export function makeFAQ(overrides: Partial<FAQ> = {}): FAQ {
  return {
    kind: "faq",
    id: "faq-1",
    slug: "what-is-geo",
    locale: "en",
    canonical: { path: "/faqs/what-is-geo/", absolute: `${siteUrl}/faqs/what-is-geo/` },
    indexation: { ...baseIndexation },
    provenance: { ...baseProvenance, collection: "faqs" },
    question: "What is GEO?",
    answer: "GEO is generative engine optimization.",
    ...overrides,
  } as FAQ;
}
