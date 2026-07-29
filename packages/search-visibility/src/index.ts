/**
 * SeoVista search-visibility domain package.
 *
 * Public contracts for tracked keywords, SERP snapshots, rank snapshots,
 * search visibility metrics, provider interfaces, normalization, and typed
 * errors. Only the package root is a supported consumer entrypoint.
 */

// ── Domain types ───────────────────────────────────────────────────────────
export type {
  TrackedKeyword,
  SerpSnapshot,
  RankSnapshot,
  SearchVisibilityMetric,
  KeywordLifecycleStatus,
  VolumeStatus,
  SerpFeature,
} from "./types.js";

// ── Provider contracts ─────────────────────────────────────────────────────
export type {
  ProviderRequestContext,
  ProviderSearchRequest,
  ProviderSearchResult,
  ProviderRankedResult,
  SearchVisibilityProvider,
} from "./provider.js";

// ── Keyword normalization ──────────────────────────────────────────────────
export {
  normalizeKeyword,
  MAX_KEYWORD_LENGTH,
} from "./keyword-normalization.js";

export type {
  NormalizedKeyword,
} from "./keyword-normalization.js";

// ── SERP normalization ─────────────────────────────────────────────────────
export {
  normalizeSerpResult,
} from "./serp-normalization.js";

export type {
  NormalizedSerpResult,
  RawSerpInput,
} from "./serp-normalization.js";

// ── URL normalization ──────────────────────────────────────────────────────
export {
  normalizeUrl,
} from "./url-normalization.js";

export type {
  NormalizedUrl,
} from "./url-normalization.js";

// ── Typed errors ───────────────────────────────────────────────────────────
export {
  createTypedError,
  isNormalizationError,
  typedErrorCodes,
} from "./typed-errors.js";

export type {
  TypedError,
  TypedErrorInput,
} from "./typed-errors.js";

// ── Mock provider (deterministic, no external egress) ──────────────────────
export {
  createMockSearchVisibilityProvider,
} from "./mock-provider.js";

export const name = "@seovista/search-visibility";
