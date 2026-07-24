export type GeoReadinessMethodologyVersion = "0.1.0" | "v1.0" | "v1.1";

export interface GeoReadinessScores {
  overall: number;
  access: number;
  understanding: number;
  evidence: number;
  authorityReadiness?: number;
}

export interface GeoReadinessCheck {
  id: string;
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  details?: string;
  module: string;
}

export interface GeoReadinessPriority {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface GeoReadinessLimitation {
  id: string;
  description: string;
  scope: "methodology" | "data" | "system";
}

export interface GeoReadinessResult {
  methodologyVersion: string;
  auditedAt: string;
  target: string;
  scores: GeoReadinessScores;
  checks: GeoReadinessCheck[];
  priorities: GeoReadinessPriority[];
  limitations: readonly GeoReadinessLimitation[];
}

export interface PassFailRule {
  checkId: string;
  threshold: number;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
}

export interface ScoringConfiguration {
  version: string;
  weights: {
    readonly access: number;
    readonly understanding: number;
    readonly evidence: number;
    readonly authorityReadiness: number;
  };
  passFailRules: readonly PassFailRule[];
  maxScore: number;
  limitations: readonly GeoReadinessLimitation[];
}

import type { IssueTag } from './issue-tags.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'experimental';
export type ModuleStatus = 'excellent' | 'good' | 'needs_improvement' | 'poor' | 'critical';

export interface ScoreOptions {
  includeNeuronWriter: boolean;
  includePerformance: boolean;
  includeAiVisibility: boolean;
  renderJavascript: boolean;
  storeSnapshot: boolean;
}

export interface ParsedPage {
  statusCode: number;
  headers: Record<string, string>;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  metaRobots?: { noindex: boolean; nofollow: boolean };
  headings: { level: number; text: string }[];
  links: { href: string; text: string; isInternal: boolean }[];
  images: { src: string; alt?: string }[];
  jsonLd: any[];
  og?: Record<string, string>;
  twitter?: Record<string, string>;
  rawHtml: string;
  textContent: string;
}

export interface ScoreContext {
  tenantId: string;
  siteId?: string | null;
  url?: string;
  normalizedUrl?: string;
  targetKeyword?: string;
  locale?: string;
  pageType?: string;
  platform?: string;
  options?: ScoreOptions;
  parsed: ParsedPage;
  enrichments?: Record<string, unknown>[];
}

export interface AuditIssue {
  code: string;
  title: string;
  severity: Severity;
  module: string;
  impact: string;
  evidence: any;
  recommendation: string;
  implementationHint?: string;
  confidence: number;
  /**
   * Per-issue point-loss contribution to the owning module's score, expressed
   * as a negative number (e.g. `-2` for a 2-point deduction). Issues that do
   * not deduct points (info-only / opportunity nudges) omit this field or set
   * it to `0`. Populated by each scoring module at the same call site as the
   * corresponding `score -= X` deduction so the value is truthful and never
   * recomputed downstream. The RSC renders this inline (e.g. `−2 puan`) so
   * users can see exactly how each issue shaped the module score.
   */
  pointLoss?: number;
  /**
   * Normalized issue tags from the canonical {@link IssueTag} vocabulary.
   * Populated by the centralized `attachIssueTags` post-process in
   * `issue-tags.ts` (wired into the scoring aggregator in `engine.ts`), never
   * by the individual scoring modules. Additive / backward-compatible: a
   * consumer that ignores the field is unaffected. Carried verbatim onto the
   * {@link Recommendation} projected from this issue so the recommendation
   * matcher can tag-match without recomputing.
   */
  issueTags?: IssueTag[];
}

/**
 * Per-issue projection surfaced in the {@link ScoreBreakdown} contract. This
 * is a render-friendly subset of {@link AuditIssue} — the RSC consumes it
 * directly without recomputation. `message` mirrors {@link AuditIssue.title}
 * (the human-readable summary); `pointLoss` is the negative point-loss
 * contribution (0 when the issue is info-only).
 */
export interface ScoreBreakdownIssue {
  code: string;
  message: string;
  pointLoss: number;
  severity: Severity;
  module: string;
}

/**
 * Per-module row in the {@link ScoreBreakdown} contract. `name` mirrors
 * {@link ScoreModuleResult.label} (e.g. "Indexability & Crawlability"); the
 * RSC renders one row per module with `score` / `maxScore` (e.g. 18/20) and
 * the module's issues with their point-loss contributions.
 */
export interface ScoreBreakdownModule {
  key: string;
  name: string;
  score: number;
  maxScore: number;
  status: ModuleStatus;
  issues: ScoreBreakdownIssue[];
}

/**
 * Per-platform AI readiness projection surfaced in the
 * {@link ScoreBreakdown} contract (VAL-A-UI-CONF-001 / VAL-A-UI-CONF-002).
 *
 * This is a render-friendly subset of the `AiVisibilityData.platformReadiness`
 * array produced by {@link AiVisibilityModule}: each entry carries the
 * platform's display `name` (e.g. "ChatGPT", "Perplexity", "Google AI
 * Overviews", "Bing Copilot"), its numeric readiness `score` (0–100), the
 * `confidence` the engine has in that estimate (0–1), a short `rationale`
 * explaining how the score was derived, and an `experimental` flag that marks
 * heuristic / non-validated estimates. The RSC renders this as a confidence
 * band label (Turkish, e.g. "Düşük — deneysel") with an icon + text pattern;
 * the raw numeric `score` is preserved inside a `<details>` / `aria-label` so
 * debug paths still see the underlying value.
 */
export interface ScoreBreakdownPlatformReadiness {
  platform: string;
  score: number;
  confidence: number;
  rationale: string;
  experimental: boolean;
}

/**
 * Structured per-module score breakdown emitted by the scoring engine so the
 * result-page RSC can render explainability without recomputing any score.
 *
 * The contract is intentionally a projection of {@link ScoreModuleResult}:
 * it carries the module-level `score` / `maxScore` / `status` plus each
 * issue's `pointLoss` contribution. `scoreVersion` is the formula identity
 * (see {@link SCORE_VERSION}) so operators can compare runs across refactors
 * and detect formula drift. `overallScore` and `band` mirror
 * `ScoreOutput.overall` for a single-source-of-truth render.
 * `platformReadiness` carries the per-platform AI readiness estimates with
 * their confidence metadata so the result page can render confidence-band
 * labels without recomputing any value.
 */
export interface ScoreBreakdown {
  scoreVersion: string;
  overallScore: number;
  band: 'excellent' | 'good' | 'needs_improvement' | 'poor' | 'critical';
  modules: ScoreBreakdownModule[];
  platformReadiness: ScoreBreakdownPlatformReadiness[];
}

export interface Recommendation {
  code: string;
  title: string;
  module: string;
  severity: Severity;
  recommendation: string;
  implementationHint?: string | undefined;
  estimatedEffort: 'low' | 'medium' | 'high';
  estimatedImpact: 'low' | 'medium' | 'high';
  confidence: number;
  /**
   * Normalized issue tags carried verbatim from the source {@link AuditIssue}
   * by `recommendationFromIssue` in `engine.ts`. Same members, same order as
   * the source issue's `issueTags`. Additive / backward-compatible: a
   * consumer (or a recommendation built from an untagged issue) is
   * unaffected. The recommendation matcher consumes these tags to rank
   * catalog services, so a dropped/mutated tag array would silently break
   * service matching.
   */
  issueTags?: IssueTag[];
}

export interface AiVisibilityData {
  answerability: number;
  citationReadiness: number;
  entityClarity: number;
  aiParseability: number;
  sourceTrustSignals: number;
  platformReadiness: {
    platform: string;
    score: number;
    confidence: number;
    rationale: string;
    experimental: boolean;
  }[];
}

export interface ScoreModuleResult {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: ModuleStatus;
  issues: AuditIssue[];
  recommendations: Recommendation[];
  aiVisibilityData?: AiVisibilityData;
  semanticAnalysisData?: Record<string, unknown>;
}

export interface ScoreModule {
  key: string;
  label: string;
  maxScore: number;
  run(context: ScoreContext): Promise<ScoreModuleResult>;
}
