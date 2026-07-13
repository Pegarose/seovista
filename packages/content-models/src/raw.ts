/**
 * Internal raw NextG transport schemas.
 *
 * These shapes are consumed by the NextG mock and the mapper. They are NOT
 * exported from the public package surface; web consumers must only import
 * domain types from the package index.
 */

import { z } from "zod";

export const rawPublicationStatusSchema = z.enum(["published", "draft", "preview", "private"]);

export const localeCodeSchema = z.string().min(1).max(16);

export const rawTimestampSchema = z.string().datetime({ offset: true });
export const rawRelationshipIdSchema = z.string().min(1).max(128);

export const rawSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const rawCanonicalPathSchema = z
  .string()
  .regex(/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/);

export const rawIndexationSchema = z.object({
  indexable: z.boolean(),
  followLinks: z.boolean().default(true),
  includeInSitemap: z.boolean().default(true),
  includeInFeed: z.boolean().default(false),
  includeInJsonLd: z.boolean().default(true),
}).strict();

export const rawProvenanceSchema = z.object({
  createdAt: rawTimestampSchema,
  updatedAt: rawTimestampSchema,
  status: rawPublicationStatusSchema,
  locale: localeCodeSchema,
  version: z.number().int().nonnegative().default(1),
}).strict();

export const rawBaseContentSchema = z.object({
  id: z.string().min(1).max(128),
  slug: rawSlugSchema,
  locale: localeCodeSchema,
  canonicalPath: rawCanonicalPathSchema.optional(),
  canonicalOverride: z.string().url().optional(),
  indexation: rawIndexationSchema.default({ indexable: true }),
  provenance: rawProvenanceSchema,
}).strict();

export const rawPageSchema = rawBaseContentSchema.extend({
  collection: z.literal("pages"),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().optional(),
  author: rawRelationshipIdSchema.optional(),
  reviewer: rawRelationshipIdSchema.optional(),
  sources: z.array(rawRelationshipIdSchema).default([]),
  relatedEntities: z.array(rawRelationshipIdSchema).default([]),
  socialImage: z.string().url().optional(),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawServiceSchema = rawBaseContentSchema.extend({
  collection: z.literal("services"),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().optional(),
  sources: z.array(rawRelationshipIdSchema).default([]),
  relatedEntities: z.array(rawRelationshipIdSchema).default([]),
  socialImage: z.string().url().optional(),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawToolSchema = rawBaseContentSchema.extend({
  collection: z.literal("tools"),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().optional(),
  isFunctioning: z.boolean().default(false),
  sources: z.array(rawRelationshipIdSchema).default([]),
  relatedEntities: z.array(rawRelationshipIdSchema).default([]),
  socialImage: z.string().url().optional(),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawArticleSchema = rawBaseContentSchema.extend({
  collection: z.literal("articles"),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().optional(),
  author: rawRelationshipIdSchema,
  reviewer: rawRelationshipIdSchema.optional(),
  sources: z.array(rawRelationshipIdSchema).default([]),
  category: z.string().optional(),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawAuthorSchema = rawBaseContentSchema.extend({
  collection: z.literal("authors"),
  name: z.string().min(1).max(200),
  bio: z.string().optional(),
  photo: z.string().url().optional(),
  socialProfiles: z.record(z.string().url()).default({}),
}).strict();

export const rawOrganizationSchema = rawBaseContentSchema.extend({
  collection: z.literal("organizations"),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  logo: z.string().url().optional(),
  url: z.string().url().optional(),
  parentOrganization: rawRelationshipIdSchema.optional(),
}).strict();

export const rawResearchReportSchema = rawBaseContentSchema.extend({
  collection: z.literal("researchReports"),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().optional(),
  isOriginalResearch: z.boolean().default(false),
  authors: z.array(rawRelationshipIdSchema).min(1),
  sources: z.array(rawRelationshipIdSchema).default([]),
  relatedEntities: z.array(rawRelationshipIdSchema).default([]),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawDefinitionSchema = rawBaseContentSchema.extend({
  collection: z.literal("definitions"),
  term: z.string().min(1).max(200),
  definition: z.string().min(1).max(2000),
  sources: z.array(rawRelationshipIdSchema).default([]),
  relatedTerms: z.array(rawRelationshipIdSchema).default([]),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawFaqSchema = rawBaseContentSchema.extend({
  collection: z.literal("faqs"),
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
  category: z.string().optional(),
  publishedAt: rawTimestampSchema.optional(),
  modifiedAt: rawTimestampSchema.optional(),
}).strict();

export const rawSourceSchema = rawBaseContentSchema.extend({
  collection: z.literal("sources"),
  title: z.string().min(1).max(300),
  url: z.string().url().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: rawTimestampSchema.optional(),
}).strict();

export const rawRedirectSchema = z.object({
  id: z.string().min(1).max(128),
  collection: z.literal("redirects"),
  source: z.string().min(1).max(500),
  destination: z.string().min(1).max(500),
  permanent: z.boolean().default(true),
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
  provenance: rawProvenanceSchema,
}).strict();

export const rawLocaleEntitySchema = z.object({
  id: z.string().min(1).max(128),
  collection: z.literal("locales"),
  code: localeCodeSchema,
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  isSupported: z.boolean().default(true),
  provenance: rawProvenanceSchema,
}).strict();

export const rawAuditLeadSchema = z.object({
  id: z.string().min(1).max(128),
  collection: z.literal("auditLeads"),
  slug: rawSlugSchema,
  email: z.string().email(),
  company: z.string().optional(),
  locale: localeCodeSchema,
  status: rawPublicationStatusSchema,
  provenance: rawProvenanceSchema,
}).strict();

export const rawEntitySchema = z.discriminatedUnion("collection", [
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
]);

export const rawCollectionResponseSchema = z.object({
  collection: z.string().min(1),
  mode: z.enum(["public", "preview"]),
  locale: z.string().min(1).max(16),
  items: z.array(z.record(z.unknown())),
  generatedAt: rawTimestampSchema,
  total: z.number().int().nonnegative(),
}).strict();

export const rawErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  collection: z.string().optional(),
}).strict();

export type RawPublicationStatus = z.infer<typeof rawPublicationStatusSchema>;
export type RawBaseContent = z.infer<typeof rawBaseContentSchema>;
export type RawPage = z.infer<typeof rawPageSchema>;
export type RawService = z.infer<typeof rawServiceSchema>;
export type RawTool = z.infer<typeof rawToolSchema>;
export type RawArticle = z.infer<typeof rawArticleSchema>;
export type RawAuthor = z.infer<typeof rawAuthorSchema>;
export type RawOrganization = z.infer<typeof rawOrganizationSchema>;
export type RawResearchReport = z.infer<typeof rawResearchReportSchema>;
export type RawDefinition = z.infer<typeof rawDefinitionSchema>;
export type RawFaq = z.infer<typeof rawFaqSchema>;
export type RawSource = z.infer<typeof rawSourceSchema>;
export type RawRedirect = z.infer<typeof rawRedirectSchema>;
export type RawLocale = z.infer<typeof rawLocaleEntitySchema>;
export type RawAuditLead = z.infer<typeof rawAuditLeadSchema>;
export type RawEntity = z.infer<typeof rawEntitySchema>;
export type RawCollectionResponse = z.infer<typeof rawCollectionResponseSchema>;
export type RawErrorResponse = z.infer<typeof rawErrorResponseSchema>;
