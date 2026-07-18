export interface RawEntity {
  id: string;
  collection: string;
  provenance: {
    createdAt: string;
    updatedAt: string;
    status: "published" | "draft" | "preview" | "private";
    locale: string;
    version: number;
  };
  [key: string]: unknown;
}

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

export type KnownErrorCode =
  | "INVALID_MODE"
  | "UNSUPPORTED_LOCALE"
  | "UNKNOWN_COLLECTION"
  | "DEFERRED_COLLECTION"
  | "NOT_FOUND";

export type PublicCollection =
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
  | "locales";

export type CollectionResult<T> =
  | { status: "ok"; items: readonly T[]; generatedAt: string }
  | { status: "unavailable"; reason: "not-configured" | "network" | "invalid" | "error"; code?: string };
