/**
 * Internal raw NextG transport types. These shapes are intentionally not
 * exported from the public package surface; they describe the mock envelope
 * produced by this app and consumed by the content-models mapper.
 */

export type RawPublicationStatus = "published" | "draft" | "preview" | "private";

export interface RawProvenance {
  createdAt: string;
  updatedAt: string;
  status: RawPublicationStatus;
  locale: string;
  version: number;
}

export interface RawIndexation {
  indexable: boolean;
  followLinks?: boolean;
  includeInSitemap?: boolean;
  includeInFeed?: boolean;
  includeInJsonLd?: boolean;
}

export interface RawBaseContent {
  id: string;
  collection: string;
  slug: string;
  locale: string;
  canonicalPath?: string;
  canonicalOverride?: string;
  indexation?: RawIndexation;
  provenance: RawProvenance;
}

export type RawEntity = RawBaseContent & Record<string, unknown>;

export interface RawCollectionResponse {
  collection: string;
  mode: "public" | "preview";
  locale: string;
  items: readonly RawEntity[];
  generatedAt: string;
  total: number;
}

export interface RawErrorResponse {
  error: string;
  code: string;
  collection?: string;
}

export type RegisteredCollection =
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
