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
  rawCollectionResponseSchema,
} from "./raw.js";
import { isSprintZeroCollection } from "./collection-matrix.js";
import { resolveCanonical, validateRedirect, validateRedirectSet, parseTrustedSiteUrl } from "./canonical.js";
import { validateLocale } from "./locale.js";
import { normalizeIndexation, validateIndexationCombination } from "./publication.js";

export function toMapFailure(field: string, reason: string): MapFailure {
  return { success: false, field, reason, redacted: true };
}

function toSchemaFailure(collection: string, error: z.ZodError): MapFailure {
  const issue = error.issues[0];
  const path = issue?.path.map(String).join(".");
  return toMapFailure(path ? `${collection}.${path}` : collection, "Invalid raw content field.");
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

  if (raw.provenance.locale !== raw.locale) {
    return { success: false, value: toMapFailure("provenance.locale", "Provenance locale must match the record locale.") };
  }

  const canonicalResult = buildCanonicalInfo(options, raw.canonicalPath, raw.canonicalOverride);
  if (!canonicalResult.success) {
    return { success: false, value: canonicalResult.value };
  }

  if (Date.parse(raw.provenance.updatedAt) < Date.parse(raw.provenance.createdAt)) {
    return { success: false, value: toMapFailure("provenance.updatedAt", "Updated time must not precede created time.") };
  }

  const editorialPublishedAt = (raw as { publishedAt?: string | undefined }).publishedAt;
  const editorialModifiedAt = (raw as { modifiedAt?: string | undefined }).modifiedAt;
  if (editorialPublishedAt && editorialModifiedAt && Date.parse(editorialModifiedAt) < Date.parse(editorialPublishedAt)) {
    return { success: false, value: toMapFailure("modifiedAt", "Modified time must not precede published time.") };
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
    return toSchemaFailure("pages", parsed.error);
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
    return toSchemaFailure("services", parsed.error);
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
    return toSchemaFailure("tools", parsed.error);
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
    return toSchemaFailure("articles", parsed.error);
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
    return toSchemaFailure("authors", parsed.error);
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
    return toSchemaFailure("organizations", parsed.error);
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
    return toSchemaFailure("researchReports", parsed.error);
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
    return toSchemaFailure("definitions", parsed.error);
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
    return toSchemaFailure("faqs", parsed.error);
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
    return toSchemaFailure("sources", parsed.error);
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
    return toSchemaFailure("redirects", parsed.error);
  }
  const r = parsed.data;

  const localeResult = validateLocale(r.provenance.locale, options.supportedLocales);
  if (!localeResult.success) return localeResult.value;
  if (r.provenance.status !== "published") {
    return toMapFailure("provenance.status", "Redirects must be published.");
  }
  if (Date.parse(r.provenance.updatedAt) < Date.parse(r.provenance.createdAt)) {
    return toMapFailure("provenance.updatedAt", "Updated time must not precede created time.");
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

export function mapLocale(raw: unknown, options: MapOptions): MapOutcome<Locale> {
  const parsed = rawLocaleEntitySchema.safeParse(raw);
  if (!parsed.success) return toSchemaFailure("locales", parsed.error);
  const r = parsed.data;
  if (!options.supportedLocales.includes(r.code) || !r.isSupported) {
    return toMapFailure("code", "Locale must be supported by the configured locale set.");
  }
  if (r.provenance.status !== "published") {
    return toMapFailure("provenance.status", "Locale records must be published.");
  }
  if (Date.parse(r.provenance.updatedAt) < Date.parse(r.provenance.createdAt)) {
    return toMapFailure("provenance.updatedAt", "Updated time must not precede created time.");
  }
  if (r.isDefault !== (r.code === options.defaultLocale)) {
    return toMapFailure("isDefault", "Locale default flag must match the configured default locale.");
  }

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
    return toSchemaFailure("auditLeads", parsed.error);
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
      return toMapFailure("collection", "Unknown collection discriminator.");
  }
}

export interface CollectionMapResult {
  readonly success: true;
  readonly value: readonly DomainEntity[];
  readonly diagnostics: readonly string[];
}

function envelopeFailure(field: string, reason: string): MapFailure {
  return toMapFailure(field, reason);
}

/**
 * Validates a raw NextG envelope before any item escapes as a domain record.
 * Collection reads are atomic: a malformed envelope or one malformed item
 * returns only a redacted failure, never a partial mapped collection.
 */
export function mapCollectionEnvelope(raw: unknown, options: MapOptions): CollectionMapResult | MapFailure {
  const parsed = rawCollectionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return envelopeFailure("envelope", "Invalid collection envelope.");
  }
  const envelope = parsed.data;
  if (!isSprintZeroCollection(envelope.collection)) {
    return envelopeFailure("collection", "Unsupported collection envelope.");
  }
  if (envelope.total !== envelope.items.length) {
    return envelopeFailure("total", "Collection total does not match the item count.");
  }
  if (!options.supportedLocales.includes(envelope.locale)) {
    return envelopeFailure("locale", "Collection envelope locale is unsupported.");
  }
  if (envelope.mode !== options.mode.kind) {
    return envelopeFailure("mode", "Collection envelope mode does not match the requested read mode.");
  }

  const mapped: DomainEntity[] = [];
  for (let index = 0; index < envelope.items.length; index += 1) {
    const item = envelope.items[index];
    const itemRecord = item as { collection?: unknown; locale?: unknown; provenance?: { locale?: unknown } };
    if (itemRecord.collection !== envelope.collection) {
      return envelopeFailure(`items[${index}].collection`, "Collection item discriminator does not match its envelope.");
    }
    if (itemRecord.locale !== undefined && itemRecord.locale !== envelope.locale) {
      return envelopeFailure(`items[${index}].locale`, "Collection item locale does not match its envelope.");
    }
    if (itemRecord.provenance?.locale !== undefined && itemRecord.provenance.locale !== envelope.locale) {
      return envelopeFailure(`items[${index}].provenance.locale`, "Collection item provenance locale does not match its envelope.");
    }
    const outcome = mapEntity(item, options);
    if (!outcome.success) {
      return envelopeFailure(`items[${index}]`, `Invalid collection item field: ${outcome.field}.`);
    }
    mapped.push(outcome.value);
  }

  if (envelope.collection === "redirects") {
    const redirects = mapped.filter((entity): entity is Redirect => entity.kind === "redirect");
    const redirectSet = validateRedirectSet(options.trustedSiteUrl, redirects);
    if (!redirectSet.success) return envelopeFailure(redirectSet.value.field, redirectSet.value.reason);
  }
  if (envelope.collection === "locales") {
    const locales = mapped.filter((entity): entity is Locale => entity.kind === "locale");
    const localeCodes = new Set(locales.map((locale) => locale.code));
    const defaults = locales.filter((locale) => locale.isDefault);
    if (localeCodes.size !== locales.length) return envelopeFailure("code", "Duplicate locale code.");
    if (defaults.length !== 1 || defaults[0]?.code !== options.defaultLocale) {
      return envelopeFailure("isDefault", "Collection must contain exactly one configured default locale.");
    }
  }
  return { success: true, value: Object.freeze(mapped), diagnostics: Object.freeze([]) };
}

/** @deprecated Prefer mapCollectionEnvelope for strict, atomic raw response mapping. */
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
