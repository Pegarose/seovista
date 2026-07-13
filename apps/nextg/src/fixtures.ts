import type { RawEntity, RawCollectionResponse } from "./types.js";
import { SPRINT_ZERO_COLLECTIONS, isSprintZeroCollection, validateSprintZeroRegistration, type CollectionName } from "@seovista/content-models";

const STABLE_TIMESTAMP = "2026-07-01T00:00:00.000Z";
const UPDATED_TIMESTAMP = "2026-07-10T00:00:00.000Z";

function provenance(status: "published" | "draft" | "preview" | "private", locale = "en"): {
  createdAt: string;
  updatedAt: string;
  status: "published" | "draft" | "preview" | "private";
  locale: string;
  version: number;
} {
  return {
    createdAt: STABLE_TIMESTAMP,
    updatedAt: UPDATED_TIMESTAMP,
    status,
    locale,
    version: 1,
  };
}

const baseIndexation = {
  indexable: true,
  followLinks: true,
  includeInSitemap: true,
  includeInFeed: false,
  includeInJsonLd: true,
};

const publicIndexation = {
  ...baseIndexation,
  includeInSitemap: true,
  includeInJsonLd: true,
};

const feedIndexation = {
  ...baseIndexation,
  includeInSitemap: true,
  includeInFeed: true,
  includeInJsonLd: true,
};

export const allFixtures: readonly RawEntity[] = [
  // Pages
  {
    id: "page-home",
    collection: "pages",
    slug: "home",
    locale: "en",
    canonicalPath: "/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "SeoVista — GEO and search visibility for the AI era",
    description: "SeoVista helps brands earn visibility in generative engines and search without fabricated claims.",
    body: "Generative engine optimization (GEO) and search visibility are changing. SeoVista builds the editorial foundation brands need to be found, understood, and cited by AI and search systems.",
    author: "author-jane",
    sources: ["source-1"],
    relatedEntities: ["service-geo", "service-seo"],
  },
  {
    id: "page-geo",
    collection: "pages",
    slug: "geo",
    locale: "en",
    canonicalPath: "/geo/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Generative Engine Optimization",
    description: "GEO makes your brand discoverable, understandable, and citable for AI and search systems.",
    body: "GEO is the practice of structuring content, evidence, and authority so that generative engines can accurately represent your brand. SeoVista does not guarantee rankings or citations.",
    relatedEntities: ["service-geo"],
  },
  {
    id: "page-seo",
    collection: "pages",
    slug: "seo",
    locale: "en",
    canonicalPath: "/seo/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Technical SEO and Index Health",
    description: "Crawlability, structure, content, and index health for sustainable search visibility.",
    body: "Our SEO work focuses on the fundamentals that make a site usable for both search engines and people: crawlability, site structure, content clarity, and index health.",
    relatedEntities: ["service-seo"],
  },
  {
    id: "page-digital-authority",
    collection: "pages",
    slug: "digital-authority",
    locale: "en",
    canonicalPath: "/digital-authority/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Digital Authority",
    description: "Earned editorial reputation and credible mentions without link schemes.",
    body: "Digital authority is built on earned mentions, editorial reputation, and credible evidence. We do not use link schemes or fabricated proof.",
    relatedEntities: ["service-digital-authority"],
  },
  {
    id: "page-tools",
    collection: "pages",
    slug: "tools",
    locale: "en",
    canonicalPath: "/tools/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Free Tools",
    description: "Tool library for GEO and SEO readiness.",
    body: "A growing library of tools. In Sprint 0, only the GEO Readiness Checker foundation is present.",
    relatedEntities: ["tool-geo-readiness-checker"],
  },
  {
    id: "page-tools-geo-readiness-checker",
    collection: "pages",
    slug: "geo-readiness-checker",
    locale: "en",
    canonicalPath: "/tools/geo-readiness-checker/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "GEO Readiness Checker",
    description: "Sprint 0 foundation page for the GEO Readiness Checker. No operational audit yet.",
    body: "This page is a non-operational foundation for the future GEO Readiness Checker. No audit, score, or report is available in Sprint 0.",
    relatedEntities: ["tool-geo-readiness-checker"],
  },
  {
    id: "page-about",
    collection: "pages",
    slug: "about",
    locale: "en",
    canonicalPath: "/about/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "About SeoVista",
    description: "SeoVista is a GMedya Group company focused on GEO and search visibility.",
    body: "SeoVista is an editorial intelligence practice within the GMedya Group. We help brands become discoverable and citable in generative and search systems.",
    relatedEntities: ["org-seovista"],
  },
  {
    id: "page-contact",
    collection: "pages",
    slug: "contact",
    locale: "en",
    canonicalPath: "/contact/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Contact SeoVista",
    description: "Get in touch with the SeoVista team during our foundation stage.",
    body: "We are in foundation stage. Reach out to learn about our GEO, SEO, and digital authority work.",
  },
  {
    id: "page-insights",
    collection: "pages",
    slug: "insights",
    locale: "en",
    canonicalPath: "/insights/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "Insights",
    description: "Research and editorial insights from SeoVista.",
    body: "A research index for SeoVista. No invented articles, metrics, or proof.",
  },
  {
    id: "page-privacy",
    collection: "pages",
    slug: "privacy",
    locale: "en",
    canonicalPath: "/privacy/",
    indexation: { ...publicIndexation, includeInSitemap: true, includeInJsonLd: false },
    provenance: provenance("published"),
    title: "Privacy Policy",
    description: "How SeoVista handles privacy and data.",
    body: "This privacy policy explains what data we collect and how we use it.",
  },
  {
    id: "page-cookies",
    collection: "pages",
    slug: "cookies",
    locale: "en",
    canonicalPath: "/cookies/",
    indexation: { ...publicIndexation, includeInSitemap: true, includeInJsonLd: false },
    provenance: provenance("published"),
    title: "Cookie Policy",
    description: "How SeoVista uses cookies.",
    body: "This cookie policy explains how we use cookies and similar technologies.",
  },
  {
    id: "page-terms",
    collection: "pages",
    slug: "terms",
    locale: "en",
    canonicalPath: "/terms/",
    indexation: { ...publicIndexation, includeInSitemap: true, includeInJsonLd: false },
    provenance: provenance("published"),
    title: "Terms of Service",
    description: "Terms and conditions for using SeoVista.",
    body: "These terms govern your use of the SeoVista website and services.",
  },
  // Draft and preview pages for testing
  {
    id: "page-draft",
    collection: "pages",
    slug: "draft-page",
    locale: "en",
    canonicalPath: "/draft-page/",
    indexation: { indexable: false },
    provenance: provenance("draft"),
    title: "Draft Page",
    description: "This page is a draft and must not appear in public output.",
    body: "Draft content.",
  },
  {
    id: "page-preview",
    collection: "pages",
    slug: "preview-page",
    locale: "en",
    canonicalPath: "/preview-page/",
    indexation: { indexable: false },
    provenance: provenance("preview"),
    title: "Preview Page",
    description: "This page is preview-only and requires authorization.",
    body: "Preview content.",
  },
  // Services
  {
    id: "service-geo",
    collection: "services",
    slug: "geo",
    locale: "en",
    canonicalPath: "/geo/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "Generative Engine Optimization",
    description: "Make your brand discoverable, understandable, and citable in AI and search systems.",
    body: "GEO service body.",
  },
  {
    id: "service-seo",
    collection: "services",
    slug: "seo",
    locale: "en",
    canonicalPath: "/seo/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "Technical SEO",
    description: "Crawlability, structure, content, and index health.",
    body: "SEO service body.",
  },
  {
    id: "service-digital-authority",
    collection: "services",
    slug: "digital-authority",
    locale: "en",
    canonicalPath: "/digital-authority/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "Digital Authority",
    description: "Earned editorial reputation and credible mentions without link schemes.",
    body: "Digital authority service body.",
  },
  // Tools
  {
    id: "tool-geo-readiness-checker",
    collection: "tools",
    slug: "geo-readiness-checker",
    locale: "en",
    canonicalPath: "/tools/geo-readiness-checker/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "GEO Readiness Checker",
    description: "Sprint 0 foundation for the GEO Readiness Checker. Not operational yet.",
    body: "Tool body.",
    isFunctioning: false,
  },
  // Articles
  {
    id: "article-1",
    collection: "articles",
    slug: "what-is-geo",
    locale: "en",
    canonicalPath: "/insights/what-is-geo/",
    indexation: feedIndexation,
    provenance: provenance("published"),
    title: "What is Generative Engine Optimization?",
    description: "An introduction to GEO without outcome guarantees.",
    body: "Article body with citations in the prose but no structured sources.",
    author: "author-jane",
    sources: ["source-1"],
    publishedAt: STABLE_TIMESTAMP,
    modifiedAt: UPDATED_TIMESTAMP,
  },
  // Authors
  {
    id: "author-jane",
    collection: "authors",
    slug: "jane-doe",
    locale: "en",
    canonicalPath: "/authors/jane-doe/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "Jane Doe",
    bio: "Editorial strategist at SeoVista.",
    socialProfiles: { linkedin: "https://linkedin.com/in/janedoe" },
  },
  // Organizations
  {
    id: "org-seovista",
    collection: "organizations",
    slug: "seovista",
    locale: "en",
    canonicalPath: "/about/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    name: "SeoVista",
    description: "A GMedya Group company focused on GEO and search visibility.",
    url: "https://seovista.com/",
    parentOrganization: "GMedya Group",
  },
  // Research Reports
  {
    id: "report-1",
    collection: "researchReports",
    slug: "geo-readiness-baseline",
    locale: "en",
    canonicalPath: "/insights/geo-readiness-baseline/",
    indexation: feedIndexation,
    provenance: provenance("published"),
    title: "GEO Readiness Baseline",
    description: "A research report on baseline GEO readiness without fabricated metrics.",
    body: "Report body.",
    isOriginalResearch: true,
    authors: ["author-jane"],
    sources: ["source-1"],
    publishedAt: STABLE_TIMESTAMP,
    modifiedAt: UPDATED_TIMESTAMP,
  },
  // Definitions
  {
    id: "definition-geo",
    collection: "definitions",
    slug: "generative-engine-optimization",
    locale: "en",
    canonicalPath: "/definitions/generative-engine-optimization/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    term: "Generative Engine Optimization",
    definition: "The practice of structuring content and evidence so generative engines can represent a brand accurately.",
    sources: ["source-1"],
    relatedTerms: [],
  },
  // FAQs
  {
    id: "faq-1",
    collection: "faqs",
    slug: "what-is-geo-faq",
    locale: "en",
    canonicalPath: "/faqs/what-is-geo/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    question: "What is GEO?",
    answer: "Generative Engine Optimization is the practice of structuring content and evidence so AI and search systems can accurately represent your brand.",
    category: "Foundation",
  },
  {
    id: "faq-2",
    collection: "faqs",
    slug: "does-geo-guarantee-rankings",
    locale: "en",
    canonicalPath: "/faqs/does-geo-guarantee-rankings/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    question: "Does GEO guarantee rankings?",
    answer: "No. GEO improves discoverability and citation potential, but no ethical provider can guarantee rankings or AI citations.",
    category: "Foundation",
  },
  // Sources
  {
    id: "source-1",
    collection: "sources",
    slug: "seovista-methodology",
    locale: "en",
    canonicalPath: "/sources/seovista-methodology/",
    indexation: publicIndexation,
    provenance: provenance("published"),
    title: "SeoVista Methodology Document",
    url: "https://seovista.com/methodology/",
    publisher: "SeoVista",
  },
  // Redirects
  {
    id: "redirect-1",
    collection: "redirects",
    source: "/old-geo/",
    destination: "/geo/",
    permanent: true,
    statusCode: 301,
    provenance: provenance("published"),
  },
  // Locales
  {
    id: "locale-en",
    collection: "locales",
    code: "en",
    name: "English",
    isDefault: true,
    isSupported: true,
    provenance: provenance("published"),
  },
  // Audit Leads
  {
    id: "audit-lead-1",
    collection: "auditLeads",
    slug: "sample-lead",
    locale: "en",
    status: "private",
    email: "lead@example.com",
    company: "Example Corp",
    provenance: provenance("private"),
  },
];

export const registeredCollections: readonly CollectionName[] = SPRINT_ZERO_COLLECTIONS;

export function isRegisteredCollection(candidate: string): candidate is CollectionName {
  return isSprintZeroCollection(candidate);
}

export function validateRegisteredCollections(collections: readonly string[]) {
  return validateSprintZeroRegistration(collections);
}

export function getFixturesForCollection(collection: string): readonly RawEntity[] {
  const items = allFixtures.filter((item) => item.collection === collection);
  return Object.freeze(items.sort((a, b) => a.id.localeCompare(b.id)));
}

export function buildCollectionResponse(
  collection: CollectionName,
  mode: "public" | "preview",
  locale: string,
  now: string,
): RawCollectionResponse {
  const items = getFixturesForCollection(collection);
  const filtered = items.filter((item) => {
    if (item.collection === "locales" || item.collection === "redirects") return true;
    const itemLocale = typeof item.locale === "string" ? item.locale : item.provenance.locale;
    if (itemLocale !== locale || item.provenance.locale !== locale) return false;
    if (mode === "public") return item.provenance.status === "published";
    return item.provenance.status !== "private";
  });
  return {
    collection,
    mode,
    locale,
    items: filtered,
    generatedAt: now,
    total: filtered.length,
  };
}

export function buildCaseStudyError(): { error: string; code: string } {
  return { error: "Case Studies are deferred and not supported in Sprint 0.", code: "DEFERRED_COLLECTION" };
}

export function buildUnknownCollectionError(collection: string): { error: string; code: string; collection: string } {
  return { error: `Unknown collection: ${collection}`, code: "UNKNOWN_COLLECTION", collection };
}

export { STABLE_TIMESTAMP };
