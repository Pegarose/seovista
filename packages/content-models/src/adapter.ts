import type {
  ContentEntity,
  DomainEntity,
  MapOptions,
  ContentProjection,
  Article,
  Page,
  ResearchReport,
  Tool,
  Service,
  Definition,
  FAQ,
  Source,
  Author,
  RelationshipField,
  EntityIndex,
  ResolveOptions,
  ResolvedPage,
  ResolvedService,
  ResolvedTool,
  ResolvedArticle,
  ResolvedResearchReport,
  ResolvedDefinition,
  ResolvedFAQ,
  ResolvedContentEntity,
  Adapter,
  RelationshipDiagnostic,
} from "./types";
import { isContentEntityPubliclyEligible, isFeedEligible, isJsonLdEligible, isSitemapEligible } from "./publication";
import { relationshipContractFor, type RelationshipContract } from "./collection-matrix";

export function buildEntityIndex(entities: readonly ContentEntity[]): EntityIndex {
  const byId = new Map<string, ContentEntity>();
  const bySlug = new Map<string, ContentEntity>();
  const byKind = new Map<string, ContentEntity[]>();
  for (const entity of entities) {
    byId.set(entity.id, entity);
    bySlug.set(entity.slug, entity);
    const list = byKind.get(entity.kind) ?? [];
    list.push(entity);
    byKind.set(entity.kind, list);
  }
  return {
    byId: Object.freeze(byId),
    bySlug: Object.freeze(bySlug),
    byKind: Object.freeze(byKind),
  };
}

interface RelationshipResolution<T extends ContentEntity = ContentEntity> {
  readonly success: boolean;
  readonly value: T | undefined;
  readonly diagnostics: readonly RelationshipDiagnostic[];
}

function diagnostic(field: RelationshipField, code: RelationshipDiagnostic["code"]): RelationshipDiagnostic {
  return { field, code, redacted: true };
}

function expectedContract(
  owner: ContentEntity | undefined,
  field: RelationshipField,
): RelationshipContract | undefined {
  return owner ? relationshipContractFor(owner, field) : undefined;
}

export function resolveSingle(
  id: string | undefined,
  field: RelationshipField,
  options: ResolveOptions,
  owner?: ContentEntity,
): RelationshipResolution {
  if (id === undefined || id === "") {
    return { success: true, value: undefined, diagnostics: [] };
  }
  if (owner?.id === id || owner?.slug === id) {
    return { success: false, value: undefined, diagnostics: [diagnostic(field, "self_reference")] };
  }
  const target = options.index.byId.get(id) ?? options.index.bySlug.get(id);
  if (!target) {
    return { success: false, value: undefined, diagnostics: [diagnostic(field, "missing_target")] };
  }
  const contract = expectedContract(owner, field);
  if (contract && !contract.targetKinds.includes(target.kind)) {
    return { success: false, value: undefined, diagnostics: [diagnostic(field, "wrong_target_kind")] };
  }
  if (!isEligibleForProjection(target, options.mode, options.projection)) {
    return { success: false, value: undefined, diagnostics: [diagnostic(field, "ineligible_target")] };
  }
  return { success: true, value: target, diagnostics: [] };
}

export function resolveMany(
  ids: readonly string[],
  field: RelationshipField,
  options: ResolveOptions,
  owner?: ContentEntity,
): { success: true; value: readonly ContentEntity[]; diagnostics: readonly RelationshipDiagnostic[] } {
  const value: ContentEntity[] = [];
  const diagnostics: RelationshipDiagnostic[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      diagnostics.push(diagnostic(field, "duplicate_target"));
      continue;
    }
    seen.add(id);
    const result = resolveSingle(id, field, options, owner);
    if (result.success && result.value) {
      value.push(result.value);
    } else {
      diagnostics.push(...result.diagnostics);
    }
  }
  return { success: true, value: Object.freeze(value), diagnostics: Object.freeze(diagnostics) };
}

function allDiagnostics(...groups: readonly (readonly RelationshipDiagnostic[])[]): readonly RelationshipDiagnostic[] {
  return Object.freeze(groups.flat());
}

export function resolvePage(page: Page, options: ResolveOptions): ResolvedPage {
  const author = resolveSingle(page.author, "author", options, page);
  const reviewer = resolveSingle(page.reviewer, "reviewer", options, page);
  const sources = resolveMany(page.sources, "sources", options, page);
  const related = resolveMany(page.relatedEntities, "relatedEntities", options, page);
  return {
    ...page,
    resolvedAuthor: author.value as Author | undefined,
    resolvedReviewer: reviewer.value as Author | undefined,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
    relationshipDiagnostics: allDiagnostics(author.diagnostics, reviewer.diagnostics, sources.diagnostics, related.diagnostics),
  };
}

export function resolveService(service: Service, options: ResolveOptions): ResolvedService {
  const sources = resolveMany(service.sources, "sources", options, service);
  const related = resolveMany(service.relatedEntities, "relatedEntities", options, service);
  return {
    ...service,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
    relationshipDiagnostics: allDiagnostics(sources.diagnostics, related.diagnostics),
  };
}

export function resolveTool(tool: Tool, options: ResolveOptions): ResolvedTool {
  const sources = resolveMany(tool.sources, "sources", options, tool);
  const related = resolveMany(tool.relatedEntities, "relatedEntities", options, tool);
  return {
    ...tool,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
    relationshipDiagnostics: allDiagnostics(sources.diagnostics, related.diagnostics),
  };
}

export function resolveArticle(article: Article, options: ResolveOptions): ResolvedArticle | { success: false; reason: string } {
  const author = resolveSingle(article.author, "author", options, article);
  if (!author.success || !author.value) {
    return { success: false, reason: "Article required author relationship is invalid." };
  }
  const reviewer = resolveSingle(article.reviewer, "reviewer", options, article);
  const sources = resolveMany(article.sources, "sources", options, article);
  return {
    ...article,
    resolvedAuthor: author.value as Author,
    resolvedReviewer: reviewer.value as Author | undefined,
    resolvedSources: sources.value as Source[],
    relationshipDiagnostics: allDiagnostics(reviewer.diagnostics, sources.diagnostics),
  };
}

export function resolveResearchReport(
  report: ResearchReport,
  options: ResolveOptions,
): ResolvedResearchReport | { success: false; reason: string } {
  const authors = resolveMany(report.authors, "authors", options, report);
  if (authors.value.length === 0 || authors.diagnostics.length > 0) {
    return { success: false, reason: "Research report required author relationship is invalid." };
  }
  const sources = resolveMany(report.sources, "sources", options, report);
  const related = resolveMany(report.relatedEntities, "relatedEntities", options, report);
  return {
    ...report,
    resolvedAuthors: authors.value as Author[],
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
    relationshipDiagnostics: allDiagnostics(sources.diagnostics, related.diagnostics),
  };
}

export function resolveDefinition(definition: Definition, options: ResolveOptions): ResolvedDefinition {
  const sources = resolveMany(definition.sources, "sources", options, definition);
  const relatedTerms = resolveMany(definition.relatedTerms, "relatedTerms", options, definition);
  return {
    ...definition,
    resolvedSources: sources.value as Source[],
    resolvedRelatedTerms: relatedTerms.value as Definition[],
    relationshipDiagnostics: allDiagnostics(sources.diagnostics, relatedTerms.diagnostics),
  };
}

export function resolveFAQ(faq: FAQ, _options: ResolveOptions): ResolvedFAQ {
  return { ...faq, relationshipDiagnostics: Object.freeze([]) };
}

function isEligibleForProjection(
  entity: ContentEntity,
  mode: MapOptions["mode"],
  projection: ContentProjection,
): boolean {
  switch (projection) {
    case "sitemap":
      return isSitemapEligible(entity, mode);
    case "feed":
      return isFeedEligible(entity, mode);
    case "jsonLd":
      return isJsonLdEligible(entity, mode);
    default:
      return isContentEntityPubliclyEligible(entity, mode, projection);
  }
}

export function resolveContentEntity(
  entity: ContentEntity,
  options: ResolveOptions,
): ResolvedContentEntity | { success: false; reason: string } {
  switch (entity.kind) {
    case "page":
      return resolvePage(entity, options);
    case "service":
      return resolveService(entity, options);
    case "tool":
      return resolveTool(entity, options);
    case "article":
      return resolveArticle(entity, options);
    case "researchReport":
      return resolveResearchReport(entity, options);
    case "definition":
      return resolveDefinition(entity, options);
    case "faq":
      return resolveFAQ(entity, options);
    default:
      return entity;
  }
}

export function createAdapter(entities: readonly DomainEntity[], options: MapOptions): Adapter {
  const content = entities.filter((e): e is ContentEntity => "kind" in e && e.kind !== "redirect" && e.kind !== "locale" && e.kind !== "auditLead");
  const index = buildEntityIndex(content);

  return {
    options,
    all: Object.freeze(entities),
    content: Object.freeze(content),
    index,
    readContent(projection: ContentProjection): readonly ContentEntity[] {
      return content.filter((entity) => isEligibleForProjection(entity, options.mode, projection));
    },
    readResolved(projection: ContentProjection): readonly ResolvedContentEntity[] {
      const eligible = content.filter((entity) => isEligibleForProjection(entity, options.mode, projection));
      const resolveOptions: ResolveOptions = { index, mode: options.mode, projection };
      const resolved: ResolvedContentEntity[] = [];
      for (const entity of eligible) {
        const result = resolveContentEntity(entity, resolveOptions);
        if ("success" in result && !result.success) {
          continue;
        }
        resolved.push(result as ResolvedContentEntity);
      }
      return Object.freeze(resolved);
    },
    readByKind<T extends ContentEntity["kind"]>(kind: T, projection: ContentProjection): readonly Extract<ContentEntity, { kind: T }>[] {
      return content.filter((entity): entity is Extract<ContentEntity, { kind: T }> => entity.kind === kind && isEligibleForProjection(entity, options.mode, projection));
    },
    readBySlug(slug: string, projection: ContentProjection): ContentEntity | undefined {
      const entity = content.find((e) => e.slug === slug);
      if (!entity) return undefined;
      return isEligibleForProjection(entity, options.mode, projection) ? entity : undefined;
    },
    readById(id: string, projection: ContentProjection): ContentEntity | undefined {
      const entity = content.find((e) => e.id === id);
      if (!entity) return undefined;
      return isEligibleForProjection(entity, options.mode, projection) ? entity : undefined;
    },
    readRedirects(): readonly Extract<DomainEntity, { kind: "redirect" }>[] {
      return Object.freeze(entities.filter((e): e is Extract<DomainEntity, { kind: "redirect" }> => e.kind === "redirect"));
    },
    readLocales(): readonly Extract<DomainEntity, { kind: "locale" }>[] {
      return Object.freeze(entities.filter((e): e is Extract<DomainEntity, { kind: "locale" }> => e.kind === "locale"));
    },
    readAuditLeads(): readonly Extract<DomainEntity, { kind: "auditLead" }>[] {
      return Object.freeze(entities.filter((e): e is Extract<DomainEntity, { kind: "auditLead" }> => e.kind === "auditLead"));
    },
  };
}
