import { z } from "zod";
import type {
  MapOptions,
  MapOutcome,
  MapFailure,
  PublicationStatus,
  Page,
  Service,
  Tool,
  Article,
  Author,
  Organization,
  ResearchReport,
  Definition,
  FAQ,
  Source,
  Redirect,
  Locale,
  AuditLead,
  DomainEntity,
  CanonicalInfo,
  Provenance,
  IndexationInfo,
} from "./types.js";
import {
  rawPageSchema,
  rawServiceSchema,
  rawToolSchema,
  rawArticleSchema,
  rawAuthorSchema,
  rawOrganizationSchema,
  rawResearchReportSchema,
  rawDefinitionSchema,
  rawFaqSchema,
  rawSourceSchema,
  rawRedirectSchema,
  rawLocaleEntitySchema,
  rawAuditLeadSchema,
} from "./raw.js";
import { resolveCanonical, validateRedirect, parseTrustedSiteUrl } from "./canonical.js";
import { validateLocale } from "./locale.js";
import { normalizeIndexation, validateIndexationCombination } from "./publication.js";

export function toMapFailure(field: string, reason: string): MapFailure {
  return { success: false, field, reason, redacted: true };
}

function buildCanonicalInfo(
  options: MapOptions,
  canonicalPath: string | undefined,
  canonicalOverride: string | undefined,
): { success: true; value: CanonicalInfo } | { success: false; value: MapFailure } {
  return resolveCanonical(options.trustedSiteUrl, canonicalPath, canonicalOverride);
}

function buildProvenance(raw: BaseOutcomeInput): Provenance {
  return {
    rawId: raw.id,
    collection: raw.collection as Provenance["collection"],
    locale: raw.provenance.locale,
    status: raw.provenance.status as Provenance["status"],
    createdAt: raw.provenance.createdAt,
    updatedAt: raw.provenance.updatedAt,
    version: raw.provenance.version,
  };
}

function buildIndexationInfo(
  raw: { indexation?: Partial<IndexationInfo> | undefined },
  status: PublicationStatus,
): { success: true; value: IndexationInfo } | { success: false; value: MapFailure } {
  const normalized = normalizeIndexation(raw.indexation);
  const combo = validateIndexationCombination(status, normalized.indexable);
  if (!combo.success) {
    return { success: false, value: combo.value };
  }
  return { success: true, value: normalized };
}

interface BaseOutcomeInput {
  id: string;
  collection: string;
  slug: string;
  locale: string;
  canonicalPath?: string | undefined;
  canonicalOverride?: string | undefined;
  indexation?: Partial<IndexationInfo> | undefined;
  provenance: { createdAt: string; updatedAt: string; status: string; locale: string; version: number };
}

function baseOutcomeChecks(
  options: MapOptions,
  raw: BaseOutcomeInput,
): { success: true; canonical: CanonicalInfo; provenance: Provenance; indexation: IndexationInfo } | { success: false; value: MapFailure } {
  const localeResult = validateLocale(raw.locale, options.supportedLocales);
  if (!localeResult.success) {
    return { success: false, value: localeResult.value };
  }

  const canonicalResult = buildCanonicalInfo(options, raw.canonicalPath, raw.canonicalOverride);
  if (!canonicalResult.success) {
    return { success: false, value: canonicalResult.value };
  }

  const provenance = buildProvenance(raw);
  const indexationResult = buildIndexationInfo(raw, provenance.status);
  if (!indexationResult.success) {
    return { success: false, value: indexationResult.value };
  }

  return {
    success: true,
    canonical: canonicalResult.value,
    provenance,
    indexation: indexationResult.value,
  };
}

export function mapPage(raw: unknown, options: MapOptions): MapOutcome<Page> {
  const parsed = rawPageSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("pages", `Invalid page fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "page",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      title: r.title,
      description: r.description,
      body: r.body,
      author: r.author,
      reviewer: r.reviewer,
      sources: r.sources,
      relatedEntities: r.relatedEntities,
      socialImage: r.socialImage,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapService(raw: unknown, options: MapOptions): MapOutcome<Service> {
  const parsed = rawServiceSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("services", `Invalid service fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "service",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      name: r.name,
      description: r.description,
      body: r.body,
      sources: r.sources,
      relatedEntities: r.relatedEntities,
      socialImage: r.socialImage,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapTool(raw: unknown, options: MapOptions): MapOutcome<Tool> {
  const parsed = rawToolSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("tools", `Invalid tool fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "tool",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      name: r.name,
      description: r.description,
      body: r.body,
      isFunctioning: r.isFunctioning,
      sources: r.sources,
      relatedEntities: r.relatedEntities,
      socialImage: r.socialImage,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapArticle(raw: unknown, options: MapOptions): MapOutcome<Article> {
  const parsed = rawArticleSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("articles", `Invalid article fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "article",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      title: r.title,
      description: r.description,
      body: r.body,
      author: r.author,
      reviewer: r.reviewer,
      sources: r.sources,
      category: r.category,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapAuthor(raw: unknown, options: MapOptions): MapOutcome<Author> {
  const parsed = rawAuthorSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("authors", `Invalid author fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "author",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      name: r.name,
      bio: r.bio,
      photo: r.photo,
      socialProfiles: r.socialProfiles,
    },
    diagnostics: [],
  };
}

export function mapOrganization(raw: unknown, options: MapOptions): MapOutcome<Organization> {
  const parsed = rawOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("organizations", `Invalid organization fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "organization",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      name: r.name,
      description: r.description,
      logo: r.logo,
      url: r.url,
      parentOrganization: r.parentOrganization,
    },
    diagnostics: [],
  };
}

export function mapResearchReport(raw: unknown, options: MapOptions): MapOutcome<ResearchReport> {
  const parsed = rawResearchReportSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("researchReports", `Invalid research report fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "researchReport",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      title: r.title,
      description: r.description,
      body: r.body,
      isOriginalResearch: r.isOriginalResearch,
      authors: r.authors,
      sources: r.sources,
      relatedEntities: r.relatedEntities,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapDefinition(raw: unknown, options: MapOptions): MapOutcome<Definition> {
  const parsed = rawDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("definitions", `Invalid definition fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "definition",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      term: r.term,
      definition: r.definition,
      sources: r.sources,
      relatedTerms: r.relatedTerms,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapFAQ(raw: unknown, options: MapOptions): MapOutcome<FAQ> {
  const parsed = rawFaqSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("faqs", `Invalid FAQ fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "faq",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      question: r.question,
      answer: r.answer,
      category: r.category,
      publishedAt: r.publishedAt,
      modifiedAt: r.modifiedAt,
    },
    diagnostics: [],
  };
}

export function mapSource(raw: unknown, options: MapOptions): MapOutcome<Source> {
  const parsed = rawSourceSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("sources", `Invalid source fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;
  const base = baseOutcomeChecks(options, r);
  if (!base.success) return base.value;

  return {
    success: true,
    value: {
      kind: "source",
      id: r.id,
      slug: r.slug,
      locale: r.locale,
      canonical: base.canonical,
      indexation: base.indexation,
      provenance: base.provenance,
      title: r.title,
      url: r.url,
      author: r.author,
      publisher: r.publisher,
      publishedAt: r.publishedAt,
    },
    diagnostics: [],
  };
}

export function mapRedirect(raw: unknown, options: MapOptions): MapOutcome<Redirect> {
  const parsed = rawRedirectSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("redirects", `Invalid redirect fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;

  const localeResult = validateLocale(r.provenance.locale, options.supportedLocales);
  if (!localeResult.success) {
    return localeResult.value;
  }

  const redirectResult = validateRedirect(options.trustedSiteUrl, {
    source: r.source,
    destination: r.destination,
    permanent: r.permanent,
    statusCode: r.statusCode,
  });
  if (!redirectResult.success) {
    return redirectResult.value;
  }

  return {
    success: true,
    value: {
      kind: "redirect",
      id: r.id,
      source: redirectResult.value.source,
      destination: redirectResult.value.destination,
      permanent: redirectResult.value.permanent,
      statusCode: redirectResult.value.statusCode,
      createdAt: r.provenance.createdAt,
      provenance: {
        rawId: r.id,
        collection: r.collection,
        locale: r.provenance.locale,
        createdAt: r.provenance.createdAt,
        updatedAt: r.provenance.updatedAt,
        version: r.provenance.version,
      },
    },
    diagnostics: [],
  };
}

export function mapLocale(raw: unknown, _options: MapOptions): MapOutcome<Locale> {
  const parsed = rawLocaleEntitySchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("locales", `Invalid locale fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;

  return {
    success: true,
    value: {
      kind: "locale",
      id: r.id,
      code: r.code,
      name: r.name,
      isDefault: r.isDefault,
      isSupported: r.isSupported,
      provenance: {
        rawId: r.id,
        collection: r.collection,
        createdAt: r.provenance.createdAt,
        updatedAt: r.provenance.updatedAt,
        version: r.provenance.version,
      },
    },
    diagnostics: [],
  };
}

export function mapAuditLead(raw: unknown, options: MapOptions): MapOutcome<AuditLead> {
  const parsed = rawAuditLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return toMapFailure("auditLeads", `Invalid audit lead fixture: ${parsed.error.message}`);
  }
  const r = parsed.data;

  const localeResult = validateLocale(r.locale, options.supportedLocales);
  if (!localeResult.success) {
    return localeResult.value;
  }

  return {
    success: true,
    value: {
      kind: "auditLead",
      id: r.id,
      slug: r.slug,
      email: r.email,
      company: r.company,
      locale: r.locale,
      status: r.provenance.status,
      createdAt: r.provenance.createdAt,
      provenance: {
        rawId: r.id,
        collection: r.collection,
        locale: r.provenance.locale,
        createdAt: r.provenance.createdAt,
        updatedAt: r.provenance.updatedAt,
        version: r.provenance.version,
      },
    },
    diagnostics: [],
  };
}

export function mapEntity(raw: unknown, options: MapOptions): MapOutcome<DomainEntity> {
  const shape = z
    .object({ collection: z.string() })
    .safeParse(raw);
  if (!shape.success) {
    return toMapFailure("collection", `Missing or invalid collection discriminator: ${shape.error.message}`);
  }

  const collection = shape.data.collection;
  switch (collection) {
    case "pages":
      return mapPage(raw, options) as MapOutcome<DomainEntity>;
    case "services":
      return mapService(raw, options) as MapOutcome<DomainEntity>;
    case "tools":
      return mapTool(raw, options) as MapOutcome<DomainEntity>;
    case "articles":
      return mapArticle(raw, options) as MapOutcome<DomainEntity>;
    case "authors":
      return mapAuthor(raw, options) as MapOutcome<DomainEntity>;
    case "organizations":
      return mapOrganization(raw, options) as MapOutcome<DomainEntity>;
    case "researchReports":
      return mapResearchReport(raw, options) as MapOutcome<DomainEntity>;
    case "definitions":
      return mapDefinition(raw, options) as MapOutcome<DomainEntity>;
    case "faqs":
      return mapFAQ(raw, options) as MapOutcome<DomainEntity>;
    case "sources":
      return mapSource(raw, options) as MapOutcome<DomainEntity>;
    case "redirects":
      return mapRedirect(raw, options) as MapOutcome<DomainEntity>;
    case "locales":
      return mapLocale(raw, options) as MapOutcome<DomainEntity>;
    case "auditLeads":
      return mapAuditLead(raw, options) as MapOutcome<DomainEntity>;
    case "caseStudies":
      return toMapFailure("collection", "Case Studies are deferred and not supported in Sprint 0.");
    default:
      return toMapFailure("collection", `Unknown collection: ${collection}`);
  }
}

export function mapCollection(
  rawItems: unknown[],
  options: MapOptions,
): {
  readonly successes: readonly DomainEntity[];
  readonly failures: readonly MapFailure[];
} {
  const successes: DomainEntity[] = [];
  const failures: MapFailure[] = [];
  for (const item of rawItems) {
    const outcome = mapEntity(item, options);
    if (outcome.success) {
      successes.push(outcome.value);
    } else {
      failures.push(outcome);
    }
  }
  return { successes: Object.freeze(successes), failures: Object.freeze(failures) };
}

export { parseTrustedSiteUrl };
