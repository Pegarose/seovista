import type { 
  ScoreContext, 
  ScoreModuleResult, 
  AuditIssue, 
  Recommendation, 
  ScoreModule
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

export interface ScoreOutput {
  scoreVersion: string;
  finalScore: number;
  scoreBand: 'excellent' | 'good' | 'needs_improvement' | 'poor' | 'critical';
  modules: Omit<ScoreModuleResult, 'issues' | 'recommendations'>[];
  topIssues: AuditIssue[];
  quickWins: { title: string; estimatedEffort: string; estimatedImpact: string; code: string }[];
  nextActions: string[];
  experimentalSignals: AuditIssue[];
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
   */
  async scorePage(context: ScoreContext, startTime: number): Promise<ScoreOutput> {
    const providerEnrichments: NWEnrichmentResult[] = [];
    if (context.options?.includeNeuronWriter) {
      const nwStart = Date.now();
      const enrichment = await enrichWithNeuronWriter(context, nwStart);
      const nwResult: NWEnrichmentResult = {
        ...enrichment,
        provider: 'neuronwriter',
      };
      providerEnrichments.push(nwResult);

      // Attach to context for SemanticModule
      context.enrichments = [nwResult as unknown as Record<string, unknown>];
    }

    const moduleResults: ScoreModuleResult[] = [];
    
    // Execute all modules
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

    // Aggregate AI Visibility and Semantic data from modules
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

    return {
      scoreVersion: 'seosuite-score-v1.1',
      finalScore,
      scoreBand,
      modules: moduleResults.map(res => ({
        key: res.key,
        label: res.label,
        score: res.score,
        maxScore: res.maxScore,
        status: res.status
      })),
      topIssues: standardIssues,
      quickWins,
      nextActions,
      experimentalSignals,
      platformReadiness,
      durationMs,
      providerEnrichments,
      semanticAnalysis: semanticAnalysis ? Object.assign({}, semanticAnalysis, { provider: 'neuronwriter' }) : semanticAnalysis,
      aiVisibility,
      recommendations,
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
