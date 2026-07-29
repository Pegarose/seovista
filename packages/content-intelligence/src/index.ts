/**
 * SeoVista content-intelligence domain package.
 *
 * Public contracts for real-time draft analysis, keyword density,
 * semantic alignment, block/document normalization, recommendations,
 * and typed analysis errors. Only the package root is a supported
 * consumer entrypoint.
 */

// ── Analysis contracts ─────────────────────────────────────────────────────
export {
  analyzeContent,
  isAnalysisError,
} from "./analysis.js";

export type {
  AnalysisInput,
  AnalysisOutput,
  AnalysisRecommendation,
  ReadabilityMetrics,
  KeywordDensityMetrics,
  CoverageMetrics,
} from "./analysis.js";

// ── Block normalization ────────────────────────────────────────────────────
export {
  normalizeBlock,
  normalizeDocument,
  isBlockError,
} from "./block-normalization.js";

export type {
  EditorBlockInput,
  NormalizedBlock,
  NormalizedParagraphBlock,
  NormalizedHeadingBlock,
  NormalizedListBlock,
  NormalizedLinkBlock,
} from "./block-normalization.js";

export const name = "@seovista/content-intelligence";
