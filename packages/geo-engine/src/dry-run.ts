import { ScoringEngine } from "./engine.js";
import type { ScoreOutput } from "./engine.js";
import type {
  AuditIssue,
  ModuleStatus,
  ParsedPage,
  ScoreContext,
  ScoreBreakdown,
} from "./types.js";

/**
 * Dry-run scoring surface (`VAL-A-VAR-001`).
 *
 * `runDryScore` runs the deterministic scoring core on a pre-built
 * `ParsedPage` fixture WITHOUT invoking the fetcher, Browseract, or
 * NeuronWriter. It builds a `ScoreContext` with `includeNeuronWriter: false`
 * (and the other network-gated options off) so no outbound HTTP requests are
 * made and the run works fully offline. The returned shape is a trimmed,
 * stable projection of `ScoreOutput` that intentionally excludes
 * time-derived fields (e.g. `durationMs`) so repeated invocations on the same
 * fixture produce byte-identical JSON.
 */

export interface DryRunOptions {
  /** Canonical URL override; defaults to `parsedPage.canonical`. */
  url?: string;
  /** Target keyword hint; optional, offline only. */
  targetKeyword?: string;
  /** Platform hint for implementation guidance; defaults to `custom`. */
  platform?: string;
  /** Locale hint; optional. */
  locale?: string;
  /** Page type hint; optional. */
  pageType?: string;
}

export interface DryRunModule {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: ModuleStatus;
}

export interface DryRunIssue {
  code: string;
  title: string;
  severity: AuditIssue["severity"];
  module: string;
  impact: string;
  recommendation: string;
  confidence: number;
}

export interface DryRunOutput {
  scoreVersion: string;
  overall: {
    score: number;
    score_version: string;
    band: ScoreOutput["scoreBand"];
  };
  modules: DryRunModule[];
  issues: DryRunIssue[];
  breakdown: ScoreBreakdown;
  platformReadiness: {
    chatgpt: number;
    perplexity: number;
    googleAiOverviews: number;
    bingCopilot: number;
  };
}

/**
 * Build the offline `ScoreContext` used by the dry-run path.
 *
 * Every network-gated option (`includeNeuronWriter`, `includePerformance`,
 * `renderJavascript`, `storeSnapshot`) is forced off so the engine never
 * reaches the fetcher, Browseract, or NeuronWriter. Only on-page signals
 * derived from `parsedPage` feed the deterministic score.
 */
export function buildDryRunContext(
  parsedPage: ParsedPage,
  opts: DryRunOptions = {},
): ScoreContext {
  const url = opts.url ?? parsedPage.canonical ?? "https://example.com/";
  const context: ScoreContext = {
    tenantId: "dry-run",
    url,
    normalizedUrl: url,
    platform: opts.platform ?? "custom",
    parsed: parsedPage,
    options: {
      includeNeuronWriter: false,
      includePerformance: false,
      includeAiVisibility: true,
      renderJavascript: false,
      storeSnapshot: false,
    },
    ...(opts.targetKeyword !== undefined ? { targetKeyword: opts.targetKeyword } : {}),
    ...(opts.locale !== undefined ? { locale: opts.locale } : {}),
    ...(opts.pageType !== undefined ? { pageType: opts.pageType } : {}),
  };
  return context;
}

/**
 * Run the deterministic scoring core on a pre-built `ParsedPage` fixture.
 *
 * Returns a trimmed, stable projection of `ScoreOutput` containing
 * `overall`, `modules`, `issues`, and `platformReadiness`. No time-derived
 * fields are included, so serializing the result with a stable key order
 * (e.g. `JSON.stringify(out, null, 2)`) yields byte-identical output across
 * repeated runs on the same fixture.
 */
export async function runDryScore(
  parsedPage: ParsedPage,
  opts: DryRunOptions = {},
): Promise<DryRunOutput> {
  const engine = new ScoringEngine();
  const context = buildDryRunContext(parsedPage, opts);
  // Pin `startTime` to 0 so `durationMs` is reproducible. It is intentionally
  // excluded from the returned projection, but pinning removes any chance of
  // a time-derived field leaking into a future shape change.
  const out = await engine.scorePage(context, 0);

  return {
    scoreVersion: out.scoreVersion,
    overall: {
      score: out.overall.score,
      score_version: out.overall.score_version,
      band: out.overall.band,
    },
    modules: out.modules.map((m) => ({
      key: m.key,
      label: m.label,
      score: m.score,
      maxScore: m.maxScore,
      status: m.status,
    })),
    issues: out.topIssues.map((i) => ({
      code: i.code,
      title: i.title,
      severity: i.severity,
      module: i.module,
      impact: i.impact,
      recommendation: i.recommendation,
      confidence: i.confidence,
    })),
    breakdown: out.breakdown,
    platformReadiness: {
      chatgpt: out.platformReadiness.chatgpt,
      perplexity: out.platformReadiness.perplexity,
      googleAiOverviews: out.platformReadiness.googleAiOverviews,
      bingCopilot: out.platformReadiness.bingCopilot,
    },
  };
}
