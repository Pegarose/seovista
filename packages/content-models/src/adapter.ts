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
} from "./types";
import { isContentEntityPubliclyEligible } from "./publication";

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

export function resolveSingle(
  id: string | undefined,
  field: RelationshipField,
  options: ResolveOptions,
): { success: true; value: ContentEntity | undefined; diagnostics: readonly string[] } | { success: false; reason: string } {
  if (id === undefined || id === "") {
    return { success: true, value: undefined, diagnostics: [] };
  }
  const target = options.index.byId.get(id) ?? options.index.bySlug.get(id);
  if (!target) {
    return { success: false, reason: `Relationship target not found for ${field}: ${id}` };
  }
  if (!isContentEntityPubliclyEligible(target, options.mode, options.projection)) {
    return { success: false, reason: `Relationship target ineligible for ${field}: ${id}` };
  }
  return { success: true, value: target, diagnostics: [] };
}

export function resolveMany(
  ids: readonly string[],
  field: RelationshipField,
  options: ResolveOptions,
): { success: true; value: readonly ContentEntity[]; diagnostics: readonly string[] } {
  const value: ContentEntity[] = [];
  const diagnostics: string[] = [];
  for (const id of ids) {
    const result = resolveSingle(id, field, options);
    if (result.success && result.value) {
      value.push(result.value);
    } else if (!result.success) {
      diagnostics.push(result.reason);
    }
  }
  return { success: true, value: Object.freeze(value), diagnostics: Object.freeze(diagnostics) };
}

export function resolvePage(page: Page, options: ResolveOptions): ResolvedPage {
  const author = resolveSingle(page.author, "author", options);
  const reviewer = resolveSingle(page.reviewer, "reviewer", options);
  const sources = resolveMany(page.sources, "sources", options);
  const related = resolveMany(page.relatedEntities, "relatedEntities", options);
  return {
    ...page,
    resolvedAuthor: author.success ? (author.value as Author | undefined) : undefined,
    resolvedReviewer: reviewer.success ? (reviewer.value as Author | undefined) : undefined,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
  };
}

export function resolveService(service: Service, options: ResolveOptions): ResolvedService {
  const sources = resolveMany(service.sources, "sources", options);
  const related = resolveMany(service.relatedEntities, "relatedEntities", options);
  return {
    ...service,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
  };
}

export function resolveTool(tool: Tool, options: ResolveOptions): ResolvedTool {
  const sources = resolveMany(tool.sources, "sources", options);
  const related = resolveMany(tool.relatedEntities, "relatedEntities", options);
  return {
    ...tool,
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
  };
}

export function resolveArticle(article: Article, options: ResolveOptions): ResolvedArticle | { success: false; reason: string } {
  const author = resolveSingle(article.author, "author", options);
  if (!author.success || !author.value) {
    return { success: false, reason: `Article requires an eligible author: ${article.id}` };
  }
  const reviewer = resolveSingle(article.reviewer, "reviewer", options);
  const sources = resolveMany(article.sources, "sources", options);
  return {
    ...article,
    resolvedAuthor: author.value as Author,
    resolvedReviewer: reviewer.success ? (reviewer.value as Author | undefined) : undefined,
    resolvedSources: sources.value as Source[],
  };
}

export function resolveResearchReport(
  report: ResearchReport,
  options: ResolveOptions,
): ResolvedResearchReport | { success: false; reason: string } {
  const authors = resolveMany(report.authors, "authors", options);
  if (authors.value.length === 0) {
    return { success: false, reason: `Research report requires at least one eligible author: ${report.id}` };
  }
  const sources = resolveMany(report.sources, "sources", options);
  const related = resolveMany(report.relatedEntities, "relatedEntities", options);
  return {
    ...report,
    resolvedAuthors: authors.value as Author[],
    resolvedSources: sources.value as Source[],
    resolvedRelatedEntities: related.value,
  };
}

export function resolveDefinition(definition: Definition, options: ResolveOptions): ResolvedDefinition {
  const sources = resolveMany(definition.sources, "sources", options);
  const relatedTerms = resolveMany(definition.relatedTerms, "relatedTerms", options);
  return {
    ...definition,
    resolvedSources: sources.value as Source[],
    resolvedRelatedTerms: relatedTerms.value as Definition[],
  };
}

export function resolveFAQ(faq: FAQ, options: ResolveOptions): ResolvedFAQ {
  const sources = resolveMany([], "sources", options);
  return {
    ...faq,
    resolvedSources: sources.value as Source[],
  };
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
      return content.filter((entity) => isContentEntityPubliclyEligible(entity, options.mode, projection));
    },
    readResolved(projection: ContentProjection): readonly ResolvedContentEntity[] {
      const eligible = content.filter((entity) => isContentEntityPubliclyEligible(entity, options.mode, projection));
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
      return content.filter((entity): entity is Extract<ContentEntity, { kind: T }> => entity.kind === kind && isContentEntityPubliclyEligible(entity, options.mode, projection));
    },
    readBySlug(slug: string, projection: ContentProjection): ContentEntity | undefined {
      const entity = content.find((e) => e.slug === slug);
      if (!entity) return undefined;
      return isContentEntityPubliclyEligible(entity, options.mode, projection) ? entity : undefined;
    },
    readById(id: string, projection: ContentProjection): ContentEntity | undefined {
      const entity = content.find((e) => e.id === id);
      if (!entity) return undefined;
      return isContentEntityPubliclyEligible(entity, options.mode, projection) ? entity : undefined;
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
