import "server-only";

import type {
  Page,
  Service,
  Tool,
  Organization,
  Locale,
  ContentEntity,
  DomainEntity,
  MapOptions,
  ReadMode,
  Provenance,
  CollectionName,
  IndexationInfo,
} from "@seovista/content-models";
import { createAdapter } from "@seovista/content-models";

const now = new Date("2026-07-13T00:00:00.000Z");

export const readMode: ReadMode = { kind: "public", now };

export const defaultLocale = "en";
export const supportedLocales = [defaultLocale] as const;

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://seovista.com";

function provenance(collection: CollectionName): Provenance {
  return {
    rawId: `${collection}-sprint0`,
    collection,
    locale: defaultLocale,
    status: "published",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
}

function indexation(includeInSitemap = true, includeInFeed = false): IndexationInfo {
  return {
    indexable: true,
    followLinks: true,
    includeInSitemap,
    includeInFeed,
    includeInJsonLd: true,
  };
}

function page(
  slug: string,
  path: string,
  title: string,
  description: string,
  body: string,
): Page {
  return {
    kind: "page",
    id: `page-${slug}`,
    slug,
    locale: defaultLocale,
    canonical: { path, absolute: `${siteUrl}${path}` },
    indexation: indexation(),
    provenance: provenance("pages"),
    title,
    description,
    body,
    sources: [],
    relatedEntities: [],
  };
}

function service(
  slug: string,
  path: string,
  name: string,
  description: string,
  body: string,
): Service {
  return {
    kind: "service",
    id: `service-${slug}`,
    slug,
    locale: defaultLocale,
    canonical: { path, absolute: `${siteUrl}${path}` },
    indexation: indexation(),
    provenance: provenance("services"),
    name,
    description,
    body,
    sources: [],
    relatedEntities: [],
  };
}

export const organization: Organization = {
  kind: "organization",
  id: "organization-seovista",
  slug: "seovista",
  locale: defaultLocale,
  canonical: { path: "/about/", absolute: `${siteUrl}/about/` },
  indexation: indexation(),
  provenance: provenance("organizations"),
  name: "SeoVista",
  description:
    "SeoVista is an editorial intelligence lab focused on generative engine optimization and search visibility. A GMedya Group company.",
  url: siteUrl,
  parentOrganization: "GMedya Group",
};

export const defaultLocaleEntity: Locale = {
  kind: "locale",
  id: "locale-en",
  code: "en",
  name: "English",
  isDefault: true,
  isSupported: true,
  provenance: {
    rawId: "locale-en",
    collection: "locales",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  },
};

export const homePage = page(
  "home",
  "/",
  "SeoVista — GEO & Search Visibility Intelligence",
  "Identify your positioning across generative engine optimization and traditional search visibility.",
  "SeoVista is an editorial intelligence lab that helps teams understand where they stand in generative answers and search results. We connect content quality, technical health, and earned authority to build a clearer picture of visibility without promising rankings or citations that cannot be guaranteed.",
);

export const geoPage = page(
  "geo",
  "/geo/",
  "Generative Engine Optimization — SeoVista",
  "What GEO means, how it differs from traditional SEO, and why quality signals matter more than any guaranteed outcome.",
  "Generative Engine Optimization (GEO) is the practice of improving the likelihood that your brand, content, and expertise are surfaced by generative search and answer systems. GEO is not a guarantee of inclusion. It is a discipline of earning relevance through clear information, credible sourcing, and consistent topical authority.",
);

export const seoPage = page(
  "seo",
  "/seo/",
  "Search Engine Optimization — SeoVista",
  "Technical crawlability, content structure, and index health for sustainable organic visibility.",
  "Our SEO work focuses on the fundamentals that make a site discoverable and trustworthy: crawlable architecture, structured content, useful metadata, and healthy indexation. We do not rely on shortcuts or fabricated ranking signals.",
);

export const digitalAuthorityPage = page(
  "digital-authority",
  "/digital-authority/",
  "Digital Authority — SeoVista",
  "Earned visibility through editorial reputation, credible mentions, and genuine subject authority.",
  "Digital authority is built on consistent, attributable expertise and references from trustworthy sources. We do not sell links, operate link schemes, or fabricate mentions. Authority is earned where your content genuinely helps a specific audience.",
);

export const toolsPage = page(
  "tools",
  "/tools/",
  "Free Tools — SeoVista",
  "A growing library of free tools for GEO and SEO readiness. Only the GEO Readiness Checker is linked during Sprint 0.",
  "SeoVista is building a set of free tools to help teams audit their readiness for generative and search visibility. In Sprint 0 only the GEO Readiness Checker foundation page is available. Additional tools are planned for later phases.",
);

export const geoReadinessChecker: Tool = {
  kind: "tool",
  id: "tool-geo-readiness-checker",
  slug: "geo-readiness-checker",
  locale: defaultLocale,
  canonical: { path: "/tools/geo-readiness-checker/", absolute: `${siteUrl}/tools/geo-readiness-checker/` },
  indexation: indexation(),
  provenance: provenance("tools"),
  name: "GEO Readiness Checker",
  description:
    "A non-operational foundation page for the GEO Readiness Checker. No Sprint 0 audit is available yet.",
  body:
    "The GEO Readiness Checker is planned as a free diagnostic that will review content clarity, technical signals, and authority indicators relevant to generative engine optimization. During Sprint 0 the checker is not operational. There is no submission, no score, and no report. We will share updates as the tool moves into development.",
  isFunctioning: false,
  sources: [],
  relatedEntities: [],
};

export const checkerPage = page(
  "geo-readiness-checker",
  "/tools/geo-readiness-checker/",
  "GEO Readiness Checker — SeoVista",
  "A non-operational foundation page for the GEO Readiness Checker. No Sprint 0 audit is available yet.",
  geoReadinessChecker.body ?? "",
);

export const aboutPage = page(
  "about",
  "/about/",
  "About SeoVista",
  "SeoVista is an editorial intelligence lab focused on GEO and search visibility. A GMedya Group company.",
  "SeoVista helps teams understand how they appear in generative answers and traditional search results. We are a GMedya Group company, built on a foundation of editorial quality, technical rigor, and transparent methodology. Our Sprint 0 release is a foundation; live audits, dashboards, and integrations will follow in later phases.",
);

export const contactPage = page(
  "contact",
  "/contact/",
  "Contact SeoVista",
  "Reach out to SeoVista. We are currently in foundation stage and respond as availability allows.",
  "We are in foundation stage and do not yet operate a public support desk. If you have questions about SeoVista, GEO, or search visibility, email hello@seovista.com. We read every message and respond when capacity allows.",
);

export const insightsPage = page(
  "insights",
  "/insights/",
  "Insights — SeoVista",
  "Research and guides on generative engine optimization, search visibility, and digital authority.",
  "Insights will host original research, practical guides, and method notes on GEO, SEO, and digital authority. Sprint 0 does not publish any articles; this page is a foundation index that will be populated once genuine research is ready.",
);

export const privacyPage = page(
  "privacy",
  "/privacy/",
  "Privacy Policy — SeoVista",
  "How SeoVista handles data and privacy during the foundation stage.",
  "SeoVista respects your privacy. During Sprint 0 we do not collect personal data through forms, accounts, or tracking beyond standard server logs. This policy explains our current practices and will be updated as the platform matures.",
);

export const cookiesPage = page(
  "cookies",
  "/cookies/",
  "Cookie Policy — SeoVista",
  "How SeoVista uses cookies and similar technologies during the foundation stage.",
  "During Sprint 0 SeoVista does not use marketing or analytics cookies. Any first-party cookies are limited to technical or preference purposes. This policy describes our cookie practices and will be updated if additional technologies are introduced.",
);

export const termsPage = page(
  "terms",
  "/terms/",
  "Terms of Service — SeoVista",
  "The terms that govern use of the SeoVista website during the foundation stage.",
  "By using seovista.com, you agree to these terms. SeoVista is provided in foundation stage without warranties or guarantees of availability. The checker and other tools are not operational in Sprint 0. Please contact us if you have questions.",
);

export const services: Service[] = [
  service(
    "geo",
    "/geo/",
    "Generative Engine Optimization",
    geoPage.description,
    geoPage.body ?? "",
  ),
  service(
    "seo",
    "/seo/",
    "Search Engine Optimization",
    seoPage.description,
    seoPage.body ?? "",
  ),
  service(
    "digital-authority",
    "/digital-authority/",
    "Digital Authority",
    digitalAuthorityPage.description,
    digitalAuthorityPage.body ?? "",
  ),
];

export const pages: Page[] = [
  homePage,
  geoPage,
  seoPage,
  digitalAuthorityPage,
  toolsPage,
  checkerPage,
  aboutPage,
  contactPage,
  insightsPage,
  privacyPage,
  cookiesPage,
  termsPage,
];

export const allContent: readonly DomainEntity[] = [
  organization,
  defaultLocaleEntity,
  ...services,
  geoReadinessChecker,
  ...pages,
];

export const mapOptions: MapOptions = {
  trustedSiteUrl: siteUrl,
  mode: readMode,
  supportedLocales: [...supportedLocales],
  defaultLocale,
};

export const adapter = createAdapter(allContent, mapOptions);

export function findPageByPath(path: string): Page | undefined {
  return pages.find((p) => p.canonical.path === path);
}

export function findServiceByPath(path: string): Service | undefined {
  return services.find((s) => s.canonical.path === path);
}

export function allPublicContent(): readonly ContentEntity[] {
  return adapter.readContent("html");
}

export function allSitemapPages(): readonly Page[] {
  return pages.filter((p) => p.indexation.includeInSitemap);
}
