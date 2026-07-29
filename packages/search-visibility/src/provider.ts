/**
 * Search visibility provider interface and request/result types.
 *
 * This is the seam that later workers consume. The provider factory
 * (in the worker app) is the sole selector; package consumers see only
 * the typed contract.
 */

import type { SerpFeature, VolumeStatus } from "./types.js";

/** Contextual information passed to every provider request. */
export interface ProviderRequestContext {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly runId: string;
  readonly fixtureId?: string;
}

/** The shape a provider receives when searching for keywords. */
export interface ProviderSearchRequest {
  readonly keyword: string;
  readonly locale?: string;
  readonly device?: "desktop" | "mobile";
  readonly context: ProviderRequestContext;
}

/** A single ranked result from a provider SERP query. */
export interface ProviderRankedResult {
  readonly position: number | null;
  readonly volume: number | null;
  readonly volumeStatus: VolumeStatus;
  readonly features: SerpFeature[];
  readonly hasResults: boolean;
}

/** The normalized result returned by any provider implementation. */
export interface ProviderSearchResult {
  readonly keyword: string;
  readonly results: ProviderRankedResult[];
  readonly hasResults: boolean;
  readonly provider: string;
  readonly fixtureId?: string;
  readonly capturedAt: string;
  readonly context: ProviderRequestContext;
}

/** The public provider interface contract. */
export interface SearchVisibilityProvider {
  /** Unique provider identifier (e.g. "mock", "dataforseo"). */
  readonly providerId: string;

  /** Execute a keyword search and return normalized results. */
  search(request: ProviderSearchRequest): Promise<ProviderSearchResult>;
}
