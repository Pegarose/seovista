/**
 * SERP result normalization.
 *
 * Maps raw provider SERP data into the canonical NormalizedSerpResult shape.
 * Handles ranked, unranked, zero-volume, unknown-volume, malformed-optional,
 * and no-results cases without rank 0 or provider-shaped values.
 */

import type { VolumeStatus, SerpFeature } from "./types.js";

/** Raw SERP input as it might arrive from a provider or fixture. */
export interface RawSerpInput {
  readonly position?: number | null;
  readonly volume?: number | null;
  readonly volumeStatus?: VolumeStatus;
  readonly features?: SerpFeature[] | null;
  readonly resultCount?: number;
  readonly [key: string]: unknown;
}

/** The canonical normalized SERP result. */
export interface NormalizedSerpResult {
  readonly position: number | null;
  readonly volume: number | null;
  readonly volumeStatus: VolumeStatus;
  readonly features: SerpFeature[];
  readonly hasResults: boolean;
}

/**
 * Normalize a raw SERP input into the canonical domain shape.
 *
 * Malformed optional fields are normalized to absent (empty/default)
 * rather than crashing. No-results is represented by `hasResults: false`
 * and position is never set to 0.
 */
export function normalizeSerpResult(raw: RawSerpInput): NormalizedSerpResult {
  // Determine if results exist
  const resultCount = typeof raw.resultCount === "number" ? raw.resultCount : undefined;
  const hasResults = resultCount !== undefined ? resultCount > 0 : raw.position !== undefined;

  // Position: use null for unranked, never use 0
  let position: number | null = null;
  if (typeof raw.position === "number" && raw.position > 0) {
    position = raw.position;
  }

  // Volume: nullable, must be non-negative integer when present
  let volume: number | null = null;
  if (typeof raw.volume === "number" && Number.isFinite(raw.volume) && raw.volume >= 0) {
    volume = Math.floor(raw.volume);
  }

  // Volume status — accept both camelCase and snake_case from raw input
  const volumeStatus: VolumeStatus =
    raw.volumeStatus === "unknown" || raw.volume_status === "unknown" ? "unknown" : "available";

  // Features: always an array, normalize malformed optional
  let features: SerpFeature[] = [];
  if (Array.isArray(raw.features)) {
    features = raw.features.filter(
      (f): f is SerpFeature => typeof f === "string" && f.length > 0,
    );
  }

  return {
    position: hasResults ? position : null,
    volume,
    volumeStatus,
    features,
    hasResults,
  };
}
