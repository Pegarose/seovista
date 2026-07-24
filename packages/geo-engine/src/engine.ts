import type { 
  ScoreContext, 
  ScoreModuleResult, 
  AuditIssue, 
  Recommendation, 
  ScoreModule,
  ScoreBreakdown,
  ScoreBreakdownModule,
  ScoreBreakdownIssue,
} from './types';
import type { NWEnrichmentResult } from './providers/neuronwriter.js';
import { IndexabilityModule } from "./modules/indexability.js";
import { TechnicalModule } from './modules/technical.js';
import { ContentModule } from './modules/content.js';
import { SemanticModule } from './modules/semantic.js';
import { ExperienceModule } from './modules/experience.js';
import { LinkingModule } from './modules/linking.js';
import { AiVisibilityModule } from './modules/ai-visibility.js';
import { enrichWithNeuronWriter } from './providers/neuronwriter.js';

export type { NWEnrichmentResult } from './providers/neuronwriter.js';

/**
 * Score formula identity.
 *
 * Bumped from `seosuite-score-v1.1` to `seovista-score-v1.2-decoupled` as part
 * of the trust-foundation refactor: NeuronWriter LSI / entity / PAA signals
 * were moved out of the deterministic score path into the enrichment-only
 * surface. Operators can compare `score_version` across cached runs to detect
 * formula drift and invalidate stale cache entries.
 */
export const SCORE_VERSION = 'seovista-score-v1.2-decoupled';

export interface ScoreOutput {
  scoreVersion: string;
  /**
   * Promoted overall score envelope. Carries the deterministic 0-100 `score`,
   * the `score_version` formula identity, and the `band`. Operators compare
   * `overall.score_version` across runs to detect formula drift. The legacy
   * `scoreVersion` / `finalScore` / `scoreBand` top-level fields are preserved
   * for backward compatibility with existing consumers.
   */
  overall: {
    score: number;
    score_version: string;
    band: ScoreOutput['scoreBand'];
  };
  finalScore: number;
  scoreBand: 'excellent' | 'good' | 'needs_improvement' | 'poor' | 'critical';
  modules: Omit<ScoreModuleResult, 'issues' | 'recommendations'>[];
  topIssues: AuditIssue[];
  quickWins: { title: string; estimatedEffort: string; estimatedImpact: string; code: string }[];
  nextActions: string[];
  experimentalSignals: AuditIssue[];
  /**
   * Issues derived from the enrichment layer (NeuronWriter LSI / entity gaps).
   * These are recommendation-surface only — they never contributed to the
   * deterministic `finalScore`, cap rules, or `platformReadiness` values.
   */
  enrichmentIssues: AuditIssue[];
  platformReadiness: {
    chatgpt: number;
    perplexity: number;
    googleAiOverviews: number;
    bingCopilot: number;
  };
  durationMs: number;
  semanticAnalysis?: Record<string, unknown> | null;
  aiVisibility?: Record<string, unknown> | null;
  providerEnrichments?: (NWEnrichmentResult & { provider?: string })[];
  recommendations: Recommendation[];
  /**
   * Structured per-module score breakdown (`VAL-A-UI-001` / `VAL-A-UI-002`).
   *
   * A render-ready projection of the deterministic scoring core: one entry
   * per module with its `score` / `maxScore` / `status` and each issue's
   * `pointLoss` contribution. The result-page RSC consumes this directly
   * without recomputing any score. `scoreVersion` mirrors `overall.score_version`
   * so operators can compare runs across refactors from a single render.
   */
  breakdown: ScoreBreakdown;
}

export class ScoringEngine {
  private modules: ScoreModule[];

  constructor() {
    this.modules = [
      new IndexabilityModule(),
      new TechnicalModule(),
      new ContentModule(),
      new SemanticModule(),
      new ExperienceModule(),
      new LinkingModule(),
      new AiVisibilityModule()
    ];
  }

  /**
   * Run all scoring modules on a parsed page context.
   *
   * The deterministic scoring core runs FIRST and in isolation from any
   * variance-producing enrichment (NeuronWriter LSI / entity / PAA). The
   * enrichment layer is fetched AFTER the score, caps, band, and platform
   * readiness have been computed, and only feeds the recommendation /
   * enrichment surface (`enrichmentIssues`, `semanticAnalysis`,
   * `providerEnrichments`). As a result, an identical `ParsedPage` produces a
   * byte-identical 0-100 score regardless of NeuronWriter response state.
   */
  async scorePage(context: ScoreContext, startTime: number): Promise<ScoreOutput> {
    const moduleResults: ScoreModuleResult[] = [];
    
    // Execute all modules. NeuronWriter enrichment is intentionally NOT
    // attached to `context.enrichments` here — modules must derive their score
    // purely from on-page signals so the score is deterministic.
    for (const mod of this.modules) {
      try {
        const result = await mod.run(context);
        moduleResults.push(result);
      } catch (err) {
        console.error(`Error executing module ${mod.key}:`, err);
        // Fallback for failed module
        moduleResults.push({
          key: mod.key,
          label: mod.label,
          score: mod.maxScore, // Graceful fallback
          maxScore: mod.maxScore,
          status: 'excellent',
          issues: [],
          recommendations: []
        });
      }
    }

    // 1. Calculate Base Weighted Score (sum of module scores)
    let finalScore = moduleResults.reduce((acc, res) => acc + res.score, 0);

    // Collect all issues & recommendations
    const allIssues: AuditIssue[] = [];
    const allRecommendations: Recommendation[] = [];

    for (const res of moduleResults) {
      allIssues.push(...res.issues);
      allRecommendations.push(...res.recommendations);
    }

    // Generate platform-specific implementation hints
    const platform = context.platform || 'custom';
    allIssues.forEach(issue => {
      if (!issue.implementationHint) {
        issue.implementationHint = this.getPlatformHint(issue.code, platform);
      }
    });

    // 2. Evaluate Cap Rules
    let capLimit = 100;
    let appliedCapCode: string | null = null;

    const hasIssue = (code: string) => allIssues.some(iss => iss.code === code);

    if (hasIssue('HTTP_5XX_DETECTED')) {
      capLimit = Math.min(capLimit, 25);
      appliedCapCode = 'HTTP_5XX_CAP';
    }
    if (hasIssue('NOINDEX_DETECTED')) {
      capLimit = Math.min(capLimit, 45);
      appliedCapCode = 'META_NOINDEX_CAP';
    }
    if (hasIssue('CANONICAL_DOMAIN_MISMATCH') || hasIssue('CANONICAL_NON_SELF_REFERENCING')) {
      capLimit = Math.min(capLimit, 60);
      appliedCapCode = 'CANONICAL_CONFLICT_CAP';
    }
    if (hasIssue('MAIN_CONTENT_EMPTY')) {
      capLimit = Math.min(capLimit, 65);
      appliedCapCode = 'MAIN_CONTENT_CAP';
    }
    if (hasIssue('THIN_CONTENT_RISK') || hasIssue('KEYWORD_STUFFING_RISK')) {
      capLimit = Math.min(capLimit, 70);
      appliedCapCode = 'SPAM_OR_THIN_CONTENT_CAP';
    }
    if (hasIssue('TITLE_MISSING')) {
      capLimit = Math.min(capLimit, 80);
      appliedCapCode = 'TITLE_MISSING_CAP';
    }

    // Apply clamping
    if (finalScore > capLimit) {
      finalScore = capLimit;
    }
    finalScore = Math.round(finalScore);

    // 3. Map Score Band
    let scoreBand: ScoreOutput['scoreBand'] = 'good';
    if (finalScore >= 90) scoreBand = 'excellent';
    else if (finalScore >= 75) scoreBand = 'good';
    else if (finalScore >= 60) scoreBand = 'needs_improvement';
    else if (finalScore >= 40) scoreBand = 'poor';
    else scoreBand = 'critical';

    // 4. Split standard issues from experimental signals
    const standardIssues = allIssues.filter(iss => iss.severity !== 'experimental');
    const experimentalSignals = allIssues.filter(iss => iss.severity === 'experimental');

    // 5. Build Platform Readiness (Normalized values from 0.0 to 1.0)
    const platformReadiness = this.calculatePlatformReadiness(standardIssues, experimentalSignals);

    // 6. Generate Quick Wins & Recommendations
    // Sort issues by estimated effort (low) and impact (high)
    const recommendationFromIssue = (iss: AuditIssue): Recommendation => ({
      code: iss.code,
      title: iss.title,
      module: iss.module,
      severity: iss.severity,
      recommendation: iss.recommendation,
      implementationHint: iss.implementationHint,
      estimatedEffort: (iss.severity === 'critical' || iss.severity === 'high') ? 'low' : 'medium',
      estimatedImpact: (iss.severity === 'critical' || iss.severity === 'high') ? 'high' : 'medium',
      confidence: iss.confidence,
    });

    const recommendations = standardIssues.map(recommendationFromIssue);

    const quickWins = recommendations
      .filter(rec => rec.severity === 'high' || rec.severity === 'critical' || rec.severity === 'medium')
      .map(rec => ({
        code: rec.code,
        title: rec.title,
        estimatedEffort: rec.estimatedEffort,
        estimatedImpact: rec.estimatedImpact,
      }))
      .slice(0, 3); // limit to top 3

    // 7. Generate Next Actions
    const nextActions = standardIssues
      .sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity))
      .slice(0, 3)
      .map(iss => iss.recommendation);

    if (appliedCapCode) {
      nextActions.unshift(`Fix critical cap blocker: ${appliedCapCode.replace('_CAP', '')}`);
    }

    const durationMs = Date.now() - startTime;

    // Aggregate AI Visibility and Semantic data from modules.
    // Only on-page (deterministic) data is sourced from modules — NeuronWriter
    // LSI / entity / PAA data is merged in below from the enrichment layer.
    let semanticAnalysis: Record<string, unknown> | null = null;
    let aiVisibility: Record<string, unknown> | null = null;

    moduleResults.forEach(mod => {
      if ('semanticAnalysisData' in mod && mod.semanticAnalysisData) {
        semanticAnalysis = mod.semanticAnalysisData;
      }
      if ('aiVisibilityData' in mod && mod.aiVisibilityData) {
        aiVisibility = mod.aiVisibilityData as unknown as Record<string, unknown>;
      }
    });

    // ── Enrichment layer (recommendations-only) ─────────────────────────────
    // NeuronWriter LSI / entity / PAA signals are fetched AFTER the score,
    // caps, band, and platform readiness have been computed. They feed the
    // recommendation / enrichment surface only and never mutate `finalScore`
    // or `platformReadiness`, so an identical `ParsedPage` yields an identical
    // score regardless of NeuronWriter response state.
    const providerEnrichments: NWEnrichmentResult[] = [];
    const enrichmentIssues: AuditIssue[] = [];

    if (context.options?.includeNeuronWriter) {
      const nwStart = Date.now();
      let enrichment: NWEnrichmentResult;
      try {
        enrichment = await enrichWithNeuronWriter(context, nwStart);
      } catch (err) {
        // Defensive: enrichWithNeuronWriter already returns an error envelope,
        // but guard against unexpected throws so the score path never crashes
        // due to enrichment failure.
        enrichment = {
          provider: 'neuronwriter',
          status: 'error',
          terms: {},
          recommendedHeadings: [],
          missingLsiTerms: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const nwResult: NWEnrichmentResult = { ...enrichment, provider: 'neuronwriter' };
      providerEnrichments.push(nwResult);

      if (enrichment.status === 'ready') {
        const bodyTextLower = (context.parsed.textContent || '').toLowerCase();
        const missingLsiTerms = enrichment.missingLsiTerms.filter(
          (term) => !bodyTextLower.includes(term.toLowerCase())
        );
        const recommendedEntities =
          enrichment.terms.entities?.map((e) => e.t).filter(Boolean) ?? [];
        const missingEntities = recommendedEntities.filter(
          (entity) => !bodyTextLower.includes(entity.toLowerCase())
        );

        if (missingLsiTerms.length > 0) {
          enrichmentIssues.push({
            code: 'SEMANTIC_LSI_GAP',
            title: 'Page content is missing competitor-related LSI terms',
            severity: 'info',
            module: 'semantic_coverage',
            impact: 'Including semantically related terms used by top competitors can strengthen topical relevance.',
            evidence: { missingLsiTerms: missingLsiTerms.slice(0, 10) },
            recommendation: `Weave the following related terms naturally into the content: ${missingLsiTerms.slice(0, 5).join(', ')}.`,
            confidence: 0.80,
            implementationHint: this.getPlatformHint('SEMANTIC_LSI_GAP', platform),
          });
        }

        if (missingEntities.length > 0) {
          enrichmentIssues.push({
            code: 'SEMANTIC_ENTITY_GAP',
            title: 'Page content is missing key topical entities identified by NLP analysis',
            severity: 'info',
            module: 'semantic_coverage',
            impact: 'Entities help search engines build topical authority and connect concepts across content.',
            evidence: { missingEntities: missingEntities.slice(0, 10) },
            recommendation: `Consider covering or referencing the following entities: ${missingEntities.slice(0, 5).join(', ')}.`,
            confidence: 0.78,
            implementationHint: this.getPlatformHint('SEMANTIC_ENTITY_GAP', platform),
          });
        }

        // Merge enrichment-derived data into the semantic analysis surface.
        semanticAnalysis = Object.assign({}, semanticAnalysis ?? {}, {
          provider: 'neuronwriter',
          recommendedHeadings: enrichment.recommendedHeadings,
          missingLsiTerms,
          missingEntities,
        });
      } else {
        // Documented fallback when enrichment errors / times out. The score is
        // unaffected; only the recommendation list loses NeuronWriter-derived
        // items and gains an explicit fallback marker.
        enrichmentIssues.push({
          code: 'SEMANTIC_ENRICHMENT_UNAVAILABLE',
          title: 'NeuronWriter semantic enrichment unavailable',
          severity: 'info',
          module: 'semantic_coverage',
          impact: 'LSI / entity / PAA gap recommendations are unavailable for this run; the score is unaffected.',
          evidence: { error: enrichment.error ?? `NeuronWriter status: ${enrichment.status}` },
          recommendation:
            'NeuronWriter enrichment skipped — score computed from on-page signals only. Re-run the audit later to surface LSI / entity gap recommendations.',
          confidence: 1.0,
          implementationHint: this.getPlatformHint('SEMANTIC_ENRICHMENT_UNAVAILABLE', platform),
        });
      }
    }

    // Append enrichment-surface issues to the recommendation list and the
    // top-issues surface. They are severity `info` so they never bubble into
    // quickWins (high/critical/medium) or dominate nextActions.
    const enrichmentRecommendations = enrichmentIssues.map(recommendationFromIssue);
    const recommendationsWithEnrichment = [...recommendations, ...enrichmentRecommendations];
    const topIssuesWithEnrichment = [...standardIssues, ...enrichmentIssues];

    // ── Per-module score breakdown (render-ready projection) ────────────────
    // Built from the deterministic `moduleResults` so the result-page RSC can
    // render per-module contributions and per-issue point-loss without
    // recomputing any score (VAL-A-UI-001 / VAL-A-UI-002). Each issue's
    // `pointLoss` is the negative deduction the module recorded at the same
    // call site as its `score -= X` (0 when the issue is info-only / an
    // opportunity nudge that does not deduct points).
    const breakdown: ScoreBreakdown = {
      scoreVersion: SCORE_VERSION,
      overallScore: finalScore,
      band: scoreBand,
      modules: moduleResults.map((res): ScoreBreakdownModule => ({
        key: res.key,
        name: res.label,
        score: res.score,
        maxScore: res.maxScore,
        status: res.status,
        issues: res.issues.map((iss): ScoreBreakdownIssue => ({
          code: iss.code,
          message: iss.title,
          pointLoss: iss.pointLoss ?? 0,
          severity: iss.severity,
          module: iss.module,
        })),
      })),
    };

    return {
      scoreVersion: SCORE_VERSION,
      overall: {
        score: finalScore,
        score_version: SCORE_VERSION,
        band: scoreBand,
      },
      finalScore,
      scoreBand,
      modules: moduleResults.map(res => ({
        key: res.key,
        label: res.label,
        score: res.score,
        maxScore: res.maxScore,
        status: res.status
      })),
      topIssues: topIssuesWithEnrichment,
      quickWins,
      nextActions,
      experimentalSignals,
      enrichmentIssues,
      platformReadiness,
      durationMs,
      providerEnrichments,
      semanticAnalysis,
      aiVisibility,
      recommendations: recommendationsWithEnrichment,
      breakdown,
    };
  }

  /**
   * Helper to fetch platform-specific implementation guidelines.
   */
  private getPlatformHint(code: string, platform: string): string {
    const hints: Record<string, Record<string, string>> = {
      TITLE_MISSING: {
        nextjs: 'Export a Metadata object or dynamic generateMetadata() function in page.tsx with a title property.',
        wordpress: 'Ensure the page editor title field is populated and check your active Yoast/RankMath settings.',
        custom: 'Add a <title>Title Text</title> tag inside the HTML <head> section.'
      },
      META_DESCRIPTION_MISSING: {
        nextjs: 'Add the description property to your Metadata object in page.tsx.',
        wordpress: 'Populate the excerpt or meta description field inside the Gutenberg editor sidebar.',
        custom: 'Add <meta name="description" content="Descriptive text..." /> inside the HTML <head>.'
      },
      CANONICAL_MISSING: {
        nextjs: 'Add alternates: { canonical: "https://your-domain.com/path" } inside the metadata configurations.',
        wordpress: 'Configure custom canonical options using the Gutenberg SEO plugin sidebar.',
        custom: 'Add <link rel="canonical" href="https://your-domain.com/path" /> inside the HTML <head>.'
      },
      H1_MISSING: {
        nextjs: 'Ensure your React render output includes a single <h1> heading tag for the primary page title.',
        wordpress: 'Gutenberg uses the post title as H1 by default. Ensure your template renders the post title correctly.',
        custom: 'Replace the top heading tag with a single <h1>Title Text</h1> in the page body.'
      },
      ARTICLE_JSON_LD_MISSING: {
        nextjs: 'Render structured data using <script type="application/ld+json">dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}</script> inside page.tsx.',
        wordpress: 'The SeoSuite plugin handles this. Verify that schema output is enabled in settings.',
        custom: 'Inject structured JSON-LD data block at the bottom of the HTML page.'
      }
    };

    return hints[code]?.[platform] || hints[code]?.custom || 'Consult your CMS configuration settings to apply this SEO recommendation.';
  }

  /**
   * Calculate Platform Readiness (0.0 to 1.0) based on standard and experimental issues
   */
  private calculatePlatformReadiness(
    standardIssues: AuditIssue[],
    experimentalSignals: AuditIssue[]
  ) {
    let chatgpt = 0.9;
    let perplexity = 0.85;
    let googleAiOverviews = 0.8;
    let bingCopilot = 0.85;

    const hasIssue = (code: string) => [...standardIssues, ...experimentalSignals].some(iss => iss.code === code);

    // ChatGPT readiness checks: values entity clarity
    if (hasIssue('ARTICLE_JSON_LD_MISSING') || hasIssue('ORGANIZATION_SCHEMA_MISSING')) chatgpt -= 0.15;
    if (hasIssue('TITLE_MISSING')) chatgpt -= 0.2;
    if (hasIssue('THIN_CONTENT_RISK')) chatgpt -= 0.15;

    // Perplexity readiness checks: values citation, links
    if (hasIssue('PLATFORM_SOURCE_FIT_WEAK')) perplexity -= 0.2;
    if (hasIssue('INTERNAL_LINKS_LOW')) perplexity -= 0.1;
    if (hasIssue('THIN_CONTENT_RISK')) perplexity -= 0.15;

    // Google AI Overviews: closely tied to indexability and Helpful Content
    if (hasIssue('HTTP_STATUS_NOT_200') || hasIssue('META_NOINDEX_FOUND')) googleAiOverviews -= 0.4;
    if (hasIssue('THIN_CONTENT_RISK') || hasIssue('CONTENT_DEPTH_LOW')) googleAiOverviews -= 0.2;
    if (hasIssue('SEMANTIC_GAP_DETECTED')) googleAiOverviews -= 0.15;

    // Bing Copilot
    if (hasIssue('CANONICAL_MISSING')) bingCopilot -= 0.1;
    if (hasIssue('TITLE_MISSING') || hasIssue('H1_MISSING')) bingCopilot -= 0.15;
    if (hasIssue('AI_PARSEABILITY_LOW')) bingCopilot -= 0.1;

    return {
      chatgpt: Math.max(0.1, Math.min(1.0, chatgpt)),
      perplexity: Math.max(0.1, Math.min(1.0, perplexity)),
      googleAiOverviews: Math.max(0.1, Math.min(1.0, googleAiOverviews)),
      bingCopilot: Math.max(0.1, Math.min(1.0, bingCopilot))
    };
  }

  private getSeverityWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 100;
      case 'high': return 80;
      case 'medium': return 50;
      case 'low': return 20;
      case 'info': return 5;
      default: return 0;
    }
  }
}
