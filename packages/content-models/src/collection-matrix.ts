import type { CollectionName, ContentEntity, RelationshipField } from "./types.js";

export type CollectionVisibility = "public" | "private";
export type RelationshipCardinality = "one" | "zero-or-one" | "zero-or-more" | "one-or-more";

export interface RelationshipContract {
  readonly required: boolean;
  readonly cardinality: RelationshipCardinality;
  readonly targetKinds: readonly ContentEntity["kind"][];
}

export interface CollectionContract {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly prohibited: readonly string[];
  readonly relationships: Readonly<Partial<Record<RelationshipField, RelationshipContract>>>;
  readonly publication: readonly ("published" | "draft" | "preview" | "private")[];
  readonly indexation: "required" | "prohibited";
  readonly visibility: CollectionVisibility;
}

const noRelationships = {} as const;
const publicContent = ["published", "draft", "preview", "private"] as const;
const publicEditorialOptional = ["body", "socialImage", "publishedAt", "modifiedAt"] as const;
const sources = { required: false, cardinality: "zero-or-more", targetKinds: ["source"] } as const;
const relatedEntities = {
  required: false,
  cardinality: "zero-or-more",
  targetKinds: ["page", "service", "tool", "article", "author", "organization", "researchReport", "definition", "faq", "source"],
} as const;

/**
 * The executable Sprint 0 content inventory. This is intentionally owned by
 * content-models so raw adapters and public consumers share one contract.
 * Case Studies are explicitly deferred and therefore absent from this map.
 */
export const SPRINT_ZERO_COLLECTION_MATRIX = Object.freeze({
  pages: {
    required: ["id", "collection", "slug", "locale", "title", "description", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "author", "reviewer", "sources", "relatedEntities"],
    prohibited: ["email", "company", "status"],
    relationships: { author: { required: false, cardinality: "zero-or-one", targetKinds: ["author"] }, reviewer: { required: false, cardinality: "zero-or-one", targetKinds: ["author"] }, sources, relatedEntities },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  services: {
    required: ["id", "collection", "slug", "locale", "name", "description", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "sources", "relatedEntities"],
    prohibited: ["email", "company", "author", "reviewer"],
    relationships: { sources, relatedEntities },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  tools: {
    required: ["id", "collection", "slug", "locale", "name", "description", "isFunctioning", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "sources", "relatedEntities"],
    prohibited: ["email", "company", "author", "reviewer"],
    relationships: { sources, relatedEntities },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  articles: {
    required: ["id", "collection", "slug", "locale", "title", "description", "author", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "reviewer", "sources", "category"],
    prohibited: ["email", "company", "relatedEntities"],
    relationships: { author: { required: true, cardinality: "one", targetKinds: ["author"] }, reviewer: { required: false, cardinality: "zero-or-one", targetKinds: ["author"] }, sources },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  authors: {
    required: ["id", "collection", "slug", "locale", "name", "socialProfiles", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", "bio", "photo"],
    prohibited: ["email", "company", "sources", "relatedEntities"],
    relationships: noRelationships,
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  organizations: {
    required: ["id", "collection", "slug", "locale", "name", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", "description", "logo", "url", "parentOrganization"],
    prohibited: ["email", "company", "sources", "relatedEntities"],
    relationships: noRelationships,
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  researchReports: {
    required: ["id", "collection", "slug", "locale", "title", "description", "authors", "isOriginalResearch", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "sources", "relatedEntities"],
    prohibited: ["email", "company", "author", "reviewer"],
    relationships: { authors: { required: true, cardinality: "one-or-more", targetKinds: ["author"] }, sources, relatedEntities },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  definitions: {
    required: ["id", "collection", "slug", "locale", "term", "definition", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", ...publicEditorialOptional, "sources", "relatedTerms"],
    prohibited: ["email", "company", "author", "reviewer"],
    relationships: { sources, relatedTerms: { required: false, cardinality: "zero-or-more", targetKinds: ["definition"] } },
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  faqs: {
    required: ["id", "collection", "slug", "locale", "question", "answer", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", "category", "publishedAt", "modifiedAt"],
    prohibited: ["email", "company", "author", "reviewer", "sources", "relatedEntities"],
    relationships: noRelationships,
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  sources: {
    required: ["id", "collection", "slug", "locale", "title", "provenance", "indexation"],
    optional: ["canonicalPath", "canonicalOverride", "url", "author", "publisher", "publishedAt"],
    prohibited: ["email", "company", "reviewer", "sources", "relatedEntities"],
    relationships: noRelationships,
    publication: publicContent,
    indexation: "required",
    visibility: "public",
  },
  redirects: {
    required: ["id", "collection", "source", "destination", "permanent", "statusCode", "provenance"],
    optional: [],
    prohibited: ["slug", "locale", "indexation", "email", "company", "body"],
    relationships: noRelationships,
    publication: ["published"],
    indexation: "prohibited",
    visibility: "public",
  },
  locales: {
    required: ["id", "collection", "code", "name", "isDefault", "isSupported", "provenance"],
    optional: [],
    prohibited: ["slug", "locale", "indexation", "email", "company", "body"],
    relationships: noRelationships,
    publication: ["published"],
    indexation: "prohibited",
    visibility: "public",
  },
  auditLeads: {
    required: ["id", "collection", "slug", "locale", "email", "status", "provenance"],
    optional: ["company"],
    prohibited: ["canonicalPath", "canonicalOverride", "indexation", "body", "sources", "relatedEntities"],
    relationships: noRelationships,
    publication: ["private"],
    indexation: "prohibited",
    visibility: "private",
  },
}) satisfies Record<CollectionName, CollectionContract>;

export const SPRINT_ZERO_COLLECTIONS = Object.freeze(Object.keys(SPRINT_ZERO_COLLECTION_MATRIX) as CollectionName[]);

export function isSprintZeroCollection(value: string): value is CollectionName {
  return SPRINT_ZERO_COLLECTIONS.includes(value as CollectionName);
}

export function validateSprintZeroRegistration(collections: readonly string[]):
  | { readonly success: true }
  | { readonly success: false; readonly field: "collections"; readonly reason: string; readonly redacted: true } {
  const unique = new Set(collections);
  if (collections.length !== unique.size) {
    return { success: false, field: "collections", reason: "Duplicate collection registration.", redacted: true };
  }
  if (collections.includes("caseStudies")) {
    return { success: false, field: "collections", reason: "Case Studies are deferred and cannot be registered in Sprint 0.", redacted: true };
  }
  const unsupported = collections.find((collection) => !isSprintZeroCollection(collection));
  if (unsupported) {
    return { success: false, field: "collections", reason: "Unsupported collection registration.", redacted: true };
  }
  if (collections.length !== SPRINT_ZERO_COLLECTIONS.length || SPRINT_ZERO_COLLECTIONS.some((collection) => !unique.has(collection))) {
    return { success: false, field: "collections", reason: "Sprint 0 registration must contain the exact supported collection inventory.", redacted: true };
  }
  return { success: true };
}

export function relationshipContractFor(
  entity: ContentEntity,
  field: RelationshipField,
): RelationshipContract | undefined {
  const contract = SPRINT_ZERO_COLLECTION_MATRIX[entity.provenance.collection] as CollectionContract;
  return contract.relationships[field];
}
