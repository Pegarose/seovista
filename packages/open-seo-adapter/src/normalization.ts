/**
 * SeoVista Normalization Contracts
 *
 * Adapted from every-app/open-seo (v0.0.25, MIT)
 * Upstream: src/shared/dataforseo.ts, src/server/features/dataforseo/
 * Commit: 3f2b4872caef809f0280a765f9eb469e8a6b523a
 *
 * Typed contracts for DataForSEO response normalization and API cost
 * tracking. Informs SeoVista's packages/dataforseo provider port.
 *
 * @owner SeoVista Foundation Team
 * @review Accepted — pattern only; no code copy
 */

import { z } from 'zod';

/**
 * Normalized API cost record for a single DataForSEO operation.
 * Immutable after creation. Used by the cost ledger.
 */
export interface SeovistaApiCostRecord {
  readonly provider: 'dataforseo';
  readonly operation: string;
  readonly requestId: string;
  readonly currency: 'USD';
  readonly amount: number; // non-negative decimal
  readonly timestamp: Date;
}

export const SeovistaApiCostRecordSchema = z.object({
  provider: z.literal('dataforseo'),
  operation: z.string().min(1),
  requestId: z.string().min(1),
  currency: z.literal('USD'),
  amount: z.number().nonnegative(),
  timestamp: z.date(),
}) satisfies z.ZodType<SeovistaApiCostRecord>;

/**
 * Normalized keyword metrics from DataForSEO keyword data API.
 */
export interface SeovistaKeywordMetrics {
  readonly keyword: string;
  readonly searchVolume: number;
  readonly competition: number;
  readonly cpc: number;
  readonly locationCode: number;
  readonly languageCode: string;
}

export const SeovistaKeywordMetricsSchema = z.object({
  keyword: z.string().min(1),
  searchVolume: z.number().int().nonnegative(),
  competition: z.number().min(0).max(1),
  cpc: z.number().nonnegative(),
  locationCode: z.number().int(),
  languageCode: z.string().min(2),
}) satisfies z.ZodType<SeovistaKeywordMetrics>;

/**
 * Normalized SERP item from DataForSEO organic search results.
 */
export interface SeovistaSerpItem {
  readonly position: number;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly domain: string;
}

export const SeovistaSerpItemSchema = z.object({
  position: z.number().int().positive(),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string(),
  domain: z.string().min(1),
}) satisfies z.ZodType<SeovistaSerpItem>;

/**
 * Normalized domain overview from DataForSEO domain analytics.
 */
export interface SeovistaDomainOverview {
  readonly domain: string;
  readonly organicTraffic: number;
  readonly organicKeywords: number;
  readonly backlinks: number;
  readonly referringDomains: number;
  readonly trafficCost: number;
}

export const SeovistaDomainOverviewSchema = z.object({
  domain: z.string().min(1),
  organicTraffic: z.number().int().nonnegative(),
  organicKeywords: z.number().int().nonnegative(),
  backlinks: z.number().int().nonnegative(),
  referringDomains: z.number().int().nonnegative(),
  trafficCost: z.number().nonnegative(),
}) satisfies z.ZodType<SeovistaDomainOverview>;
