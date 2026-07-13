/**
 * SeoVista-owned domain types for content models.
 *
 * These types are produced by the raw-to-domain mapper and are the only
 * contracts that web consumers may import. Raw NextG transport shapes are
 * intentionally not exported from the public package surface.
 */

export type PublicationStatus = "published" | "draft" | "preview" | "private";
export type LocaleCode = "en" | string;

export interface Provenance {
  rawId: string;
  collection: CollectionName;
  locale: string;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type CollectionName =
  | "pages"
  | "services"
  | "tools"
  | "articles"
  | "authors"
  | "organizations"
  | "researchReports"
  | "definitions"
  | "faqs"
  | "sources"
  | "redirects"
  | "locales"
  | "auditLeads";

export type DeferredCollectionName = "caseStudies";
export type PublicCollectionName = Exclude<CollectionName, "auditLeads">;

export interface CanonicalInfo {
  path: string;
  absolute: string;
  override?: string | undefined;
}

export interface IndexationInfo {
  indexable: boolean;
  followLinks: boolean;
  includeInSitemap: boolean;
  includeInFeed: boolean;
  includeInJsonLd: boolean;
}

export interface BaseContent {
  id: string;
  slug: string;
  locale: LocaleCode;
  canonical: CanonicalInfo;
  indexation: IndexationInfo;
  provenance: Provenance;
}

export interface Page extends BaseContent {
  kind: "page";
  title: string;
  description: string;
  body?: string | undefined;
  author?: string | undefined;
  reviewer?: string | undefined;
  sources: string[];
  relatedEntities: string[];
  socialImage?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Service extends BaseContent {
  kind: "service";
  name: string;
  description: string;
  body?: string | undefined;
  sources: string[];
  relatedEntities: string[];
  socialImage?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Tool extends BaseContent {
  kind: "tool";
  name: string;
  description: string;
  body?: string | undefined;
  isFunctioning: boolean;
  sources: string[];
  relatedEntities: string[];
  socialImage?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Article extends BaseContent {
  kind: "article";
  title: string;
  description: string;
  body?: string | undefined;
  author: string;
  reviewer?: string | undefined;
  sources: string[];
  category?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Author extends BaseContent {
  kind: "author";
  name: string;
  bio?: string | undefined;
  photo?: string | undefined;
  socialProfiles: Record<string, string>;
}

export interface Organization extends BaseContent {
  kind: "organization";
  name: string;
  description?: string | undefined;
  logo?: string | undefined;
  url?: string | undefined;
  parentOrganization?: string | undefined;
}

export interface ResearchReport extends BaseContent {
  kind: "researchReport";
  title: string;
  description: string;
  body?: string | undefined;
  isOriginalResearch: boolean;
  authors: string[];
  sources: string[];
  relatedEntities: string[];
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Definition extends BaseContent {
  kind: "definition";
  term: string;
  definition: string;
  sources: string[];
  relatedTerms: string[];
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface FAQ extends BaseContent {
  kind: "faq";
  question: string;
  answer: string;
  category?: string | undefined;
  publishedAt?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface Source extends BaseContent {
  kind: "source";
  title: string;
  url?: string | undefined;
  author?: string | undefined;
  publisher?: string | undefined;
  publishedAt?: string | undefined;
}

export interface Redirect {
  kind: "redirect";
  id: string;
  source: string;
  destination: string;
  permanent: boolean;
  statusCode: 301 | 302;
  createdAt: string;
  provenance: Pick<Provenance, "rawId" | "collection" | "locale" | "createdAt" | "updatedAt" | "version">;
}

export interface Locale {
  kind: "locale";
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isSupported: boolean;
  provenance: Pick<Provenance, "rawId" | "collection" | "createdAt" | "updatedAt" | "version">;
}

export interface AuditLead {
  kind: "auditLead";
  id: string;
  slug: string;
  email: string;
  company?: string | undefined;
  locale: LocaleCode;
  status: PublicationStatus;
  createdAt: string;
  provenance: Pick<Provenance, "rawId" | "collection" | "locale" | "createdAt" | "updatedAt" | "version">;
}

export type ContentEntity =
  | Page
  | Service
  | Tool
  | Article
  | Author
  | Organization
  | ResearchReport
  | Definition
  | FAQ
  | Source;

export type DomainEntity = ContentEntity | Redirect | Locale | AuditLead;

export type ContentProjection =
  | "html"
  | "metadata"
  | "jsonLd"
  | "sitemap"
  | "feed"
  | "llms";

export interface PublicMode {
  readonly kind: "public";
  readonly now: Date;
}

export interface PreviewMode {
  readonly kind: "preview";
  readonly now: Date;
  readonly authorization: PreviewAuthorization;
}

export interface PreviewAuthorization {
  readonly scope: "preview";
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly tokenHash: string;
}

export type ReadMode = PublicMode | PreviewMode;

export interface MapOptions {
  readonly trustedSiteUrl: string;
  readonly mode: ReadMode;
  readonly supportedLocales: readonly string[];
  readonly defaultLocale: string;
}

export interface MapResult<T extends DomainEntity> {
  readonly success: true;
  readonly value: T;
  readonly diagnostics: readonly string[];
}

export interface MapFailure {
  readonly success: false;
  readonly field: string;
  readonly reason: string;
  readonly redacted: true;
}

export type MapOutcome<T extends DomainEntity> = MapResult<T> | MapFailure;

export interface EligibilityCheck {
  readonly entity: DomainEntity;
  readonly mode: ReadMode;
  readonly projection: ContentProjection;
}

export interface RelationshipDiagnostic {
  readonly field: RelationshipField;
  readonly code: "missing_target" | "ineligible_target" | "wrong_target_kind" | "duplicate_target" | "self_reference";
  readonly redacted: true;
}

export interface ResolvedPage extends Page {
  readonly resolvedAuthor?: Author | undefined;
  readonly resolvedReviewer?: Author | undefined;
  readonly resolvedSources: readonly Source[];
  readonly resolvedRelatedEntities: readonly ContentEntity[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedService extends Service {
  readonly resolvedSources: readonly Source[];
  readonly resolvedRelatedEntities: readonly ContentEntity[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedTool extends Tool {
  readonly resolvedSources: readonly Source[];
  readonly resolvedRelatedEntities: readonly ContentEntity[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedArticle extends Article {
  readonly resolvedAuthor: Author;
  readonly resolvedReviewer?: Author | undefined;
  readonly resolvedSources: readonly Source[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedResearchReport extends ResearchReport {
  readonly resolvedAuthors: readonly Author[];
  readonly resolvedSources: readonly Source[];
  readonly resolvedRelatedEntities: readonly ContentEntity[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedDefinition extends Definition {
  readonly resolvedSources: readonly Source[];
  readonly resolvedRelatedTerms: readonly Definition[];
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export interface ResolvedFAQ extends FAQ {
  readonly relationshipDiagnostics: readonly RelationshipDiagnostic[];
}

export type ResolvedContentEntity =
  | ResolvedPage
  | ResolvedService
  | ResolvedTool
  | ResolvedArticle
  | ResolvedResearchReport
  | ResolvedDefinition
  | ResolvedFAQ
  | Author
  | Organization
  | Source;

export type RelationshipField =
  | "author"
  | "reviewer"
  | "sources"
  | "relatedEntities"
  | "authors"
  | "relatedTerms"
  | "parentOrganization";

export interface ResolvedEntity<T extends ContentEntity = ContentEntity> {
  readonly entity: T;
  readonly diagnostics: readonly string[];
}

export interface EntityIndex {
  readonly byId: ReadonlyMap<string, ContentEntity>;
  readonly bySlug: ReadonlyMap<string, ContentEntity>;
  readonly byKind: ReadonlyMap<string, readonly ContentEntity[]>;
}

export interface ResolveOptions {
  readonly index: EntityIndex;
  readonly mode: ReadMode;
  readonly projection: ContentProjection;
}

export interface Adapter {
  readonly options: MapOptions;
  readonly all: readonly DomainEntity[];
  readonly content: readonly ContentEntity[];
  readonly index: EntityIndex;
  readContent(projection: ContentProjection): readonly ContentEntity[];
  readResolved(projection: ContentProjection): readonly ResolvedContentEntity[];
  readByKind<T extends ContentEntity["kind"]>(kind: T, projection: ContentProjection): readonly Extract<ContentEntity, { kind: T }>[];
  readBySlug(slug: string, projection: ContentProjection): ContentEntity | undefined;
  readById(id: string, projection: ContentProjection): ContentEntity | undefined;
  readRedirects(): readonly Extract<DomainEntity, { kind: "redirect" }>[];
  readLocales(): readonly Extract<DomainEntity, { kind: "locale" }>[];
  readAuditLeads(): readonly Extract<DomainEntity, { kind: "auditLead" }>[];
}
