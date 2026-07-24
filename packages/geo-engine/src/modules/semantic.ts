import type { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

/**
 * Semantic Coverage Module — Phase 1 Fallback Analyzer
 *
 * When targetKeyword is provided: checks alignment in title, H1, intro, headings, body.
 * When targetKeyword is absent: infers primary topic from title, H1, first paragraph,
 * and repeated heading/body terms.
 *
 * IMPORTANT: This module does NOT suggest mechanical keyword stuffing.
 * Recommendations are topic-coverage and information-gain focused.
 */
export class SemanticModule implements ScoreModule {
  key = 'semantic_coverage';
  label = 'Semantic Coverage';
  maxScore = 15;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    const { targetKeyword, parsed } = context;
    const bodyText = parsed.textContent || '';
    const bodyWords = bodyText.split(/\s+/).filter(w => w.length > 2);
    const h1s = parsed.headings.filter(h => h.level === 1);
    const h2s = parsed.headings.filter(h => h.level === 2);
    const allHeadingTexts = parsed.headings.map(h => h.text.toLowerCase()).join(' ');
    const first150Words = bodyWords.slice(0, 150).join(' ').toLowerCase();

    // ── Branch 1: targetKeyword provided ──────────────────────────────────────
    if (targetKeyword) {
      const kwLower = targetKeyword.toLowerCase();

      const inTitle = (parsed.title || '').toLowerCase().includes(kwLower);
      const inH1 = h1s.some(h => h.text.toLowerCase().includes(kwLower));
      const inIntro = first150Words.includes(kwLower);
      const inBody = bodyText.toLowerCase().includes(kwLower);
      // const inHeadings = allHeadingTexts.includes(kwLower);

      // Count heading coverage for the topic
      const topicRelatedHeadings = h2s.filter(h => {
        const words = kwLower.split(' ');
        return words.some(w => h.text.toLowerCase().includes(w));
      });

      // NOTE: NeuronWriter LSI / entity / PAA signals have been moved out of the
      // score path (trust-foundation refactor). The SemanticModule now derives
      // its score purely from on-page signals (title / H1 / intro / body /
      // heading coverage). NeuronWriter-derived `SEMANTIC_LSI_GAP` and
      // `SEMANTIC_ENTITY_GAP` issues are emitted by the engine's enrichment
      // layer after scoring and feed the recommendation surface only — they no
      // longer deduct points from this module or affect platform readiness.

      if (!inTitle) {
        const isDoc = context.pageType === 'documentation';
        issues.push({
          code: 'TARGET_KEYWORD_NOT_IN_TITLE',
          title: 'Target keyword is missing from the title tag',
          severity: isDoc ? 'medium' : 'high',
          module: this.key,
          impact: 'Title is the strongest relevance signal for search ranking.',
          evidence: { targetKeyword, titleText: parsed.title },
          recommendation: isDoc 
            ? 'Ensure the topic is aligned with the title, though exact keyword match is less critical for docs.' 
            : 'Naturally include the primary topic in the title tag, ideally near the beginning.',
          confidence: isDoc ? 0.70 : 0.92,
          pointLoss: -(isDoc ? 1 : 3),
        });
        score -= isDoc ? 1 : 3;
      }

      if (!inH1 && h1s.length > 0) {
        issues.push({
          code: 'TARGET_KEYWORD_NOT_IN_H1',
          title: 'Target keyword is missing from the H1 heading',
          severity: 'medium',
          module: this.key,
          impact: 'H1 is the primary structural signal that reinforces the page topic for crawlers.',
          evidence: { targetKeyword, h1Text: h1s[0]?.text },
          recommendation: 'Align the H1 heading with the target topic naturally.',
          confidence: 0.88,
          pointLoss: -2,
        });
        score -= 2;
      }

      if (!inIntro) {
        issues.push({
          code: 'TARGET_KEYWORD_NOT_IN_INTRO',
          title: 'Target topic missing from the opening content',
          severity: 'medium',
          module: this.key,
          impact: 'Establishing the topic early improves relevance matching and user engagement.',
          evidence: { targetKeyword, introSnippet: first150Words.substring(0, 80) },
          recommendation: 'Introduce the core topic naturally within the first 100-150 words.',
          confidence: 0.85,
          pointLoss: -2,
        });
        score -= 2;
      }

      if (!inBody && inIntro) {
        // It appears in the intro but nowhere else in the body
        issues.push({
          code: 'LOW_SEMANTIC_COVERAGE',
          title: 'Target topic has limited coverage in the body content',
          severity: 'medium',
          module: this.key,
          impact: 'Comprehensive topic coverage helps satisfy user intent and semantic search signals.',
          evidence: { targetKeyword },
          recommendation: 'Expand content to cover subtopics and related aspects of the main theme.',
          confidence: 0.80,
          pointLoss: -2,
        });
        score -= 2;
      } else if (!inBody && !inIntro) {
        issues.push({
          code: 'SEMANTIC_GAP_DETECTED',
          title: 'Target topic is absent from the page content',
          severity: 'high',
          module: this.key,
          impact: 'Without the target topic in the content, the page has near-zero relevance for this query.',
          evidence: { targetKeyword },
          recommendation: 'Ensure the core topic is clearly addressed throughout the content.',
          confidence: 0.95,
          pointLoss: -5,
        });
        score -= 5;
      }

      if (topicRelatedHeadings.length < 1 && h2s.length > 0) {
        issues.push({
          code: 'HEADING_COVERAGE_WEAK',
          title: 'Subheadings do not reflect the target topic',
          severity: 'low',
          module: this.key,
          impact: 'Section headings help search engines understand topical depth.',
          evidence: { targetKeyword, h2Count: h2s.length, topicHeadings: topicRelatedHeadings.length },
          recommendation: 'Use subheadings that address subtopics and questions related to the main theme.',
          confidence: 0.78,
          pointLoss: -1,
        });
        score -= 1;
      }

      // Suggest information gain opportunities (not keyword stuffing)
      if (inBody && topicRelatedHeadings.length >= 1 && score >= this.maxScore - 3) {
        issues.push({
          code: 'INFORMATION_GAIN_OPPORTUNITY',
          title: 'Content could address additional subtopics for broader coverage',
          severity: 'info',
          module: this.key,
          impact: 'Content covering more facets of a topic tends to rank for more related queries.',
          evidence: { targetKeyword },
          recommendation: `Consider adding sections addressing user questions around "${targetKeyword}" such as comparisons, use cases, or FAQs.`,
          confidence: 0.70,
        });
      }

      // LSI / entity gap recommendations (SEMANTIC_LSI_GAP / SEMANTIC_ENTITY_GAP)
      // are now emitted by the engine's enrichment layer from NeuronWriter
      // data and are recommendation-surface only — they no longer deduct score
      // here. See `ScoringEngine.scorePage` post-scoring enrichment step.

      const semanticCoverageScore = Math.round((score / this.maxScore) * 100);

      return {
        key: this.key,
        label: this.label,
        score: Math.max(0, score),
        maxScore: this.maxScore,
        status: this.getStatus(score),
        issues,
        recommendations: [],
        // Extra analysis attached for response shape. NeuronWriter-derived
        // fields (missingLsiTerms / missingEntities / recommendedHeadings /
        // provider) are merged in by the engine after enrichment completes.
        semanticAnalysisData: this.buildSemanticAnalysis({
          targetKeywordProvided: true,
          inferredPrimaryTopic: null,
          topicConfidence: null,
          semanticCoverageScore,
          missingTopics: issues.filter(i => i.severity === 'high' || i.severity === 'medium').map(i => i.code),
          recommendedHeadings: [],
          missingLsiTerms: [],
          missingEntities: [],
        }),
      };
    }

    // ── Branch 2: No targetKeyword — infer primary topic ─────────────────────
    const candidateTerms = this.extractCandidateTerms(parsed.title, h1s, first150Words, allHeadingTexts);
    const inferredPrimaryTopic = candidateTerms[0] || null;
    const topicConfidence = candidateTerms.length > 0
      ? Math.min(0.85, 0.4 + (candidateTerms.length * 0.08))
      : 0.2;

    if (!inferredPrimaryTopic) {
      issues.push({
        code: 'PRIMARY_TOPIC_UNCLEAR',
        title: 'Primary topic cannot be inferred from the page',
        severity: 'high',
        module: this.key,
        impact: 'Without a clear topic, the page risks low semantic relevance and broad traffic dispersion.',
        evidence: { titleText: parsed.title, h1Count: h1s.length },
        recommendation: 'Provide a targetKeyword in the API request, or ensure the title and H1 clearly express the page topic.',
        confidence: 0.90,
        pointLoss: -5,
      });
      score -= 5;
    } else if (topicConfidence < 0.5) {
      issues.push({
        code: 'TOPIC_INFERENCE_LOW_CONFIDENCE',
        title: 'Primary topic inferred with low confidence',
        severity: 'info',
        module: this.key,
        impact: 'Ambiguous page structure makes it hard to determine the core topic.',
        evidence: { inferredTopic: inferredPrimaryTopic, confidence: topicConfidence },
        recommendation: 'Provide a targetKeyword for precise semantic analysis.',
        confidence: topicConfidence,
      });
    }

    // Without targetKeyword, always add info nudge
    issues.push({
      code: 'TARGET_KEYWORD_NOT_PROVIDED',
      title: 'No target keyword provided — semantic analysis run at reduced precision',
      severity: 'info',
      module: this.key,
      impact: 'Semantic gap suggestions are more actionable with a specific target keyword.',
      evidence: { inferredPrimaryTopic },
      recommendation: 'Add targetKeyword to the score request for topic-aligned gap detection.',
      confidence: 0.95,
    });

    const semanticCoverageScore = Math.round((score / this.maxScore) * 100);

    return {
      key: this.key,
      label: this.label,
      score: Math.max(0, score),
      maxScore: this.maxScore,
      status: this.getStatus(score),
      issues,
      recommendations: [],
      semanticAnalysisData: this.buildSemanticAnalysis({
        targetKeywordProvided: false,
        inferredPrimaryTopic,
        topicConfidence,
        semanticCoverageScore,
        missingTopics: [],
        recommendedHeadings: [],
        missingLsiTerms: [],
        missingEntities: [],
      }),
    };
  }

  /** Extract candidate topic terms from page signals */
  private extractCandidateTerms(
    title: string | undefined,
    h1s: { text: string }[],
    introText: string,
    headingText: string
  ): string[] {
    const candidates: Map<string, number> = new Map();

    const addTerms = (text: string, weight: number) => {
      // Extract 2-3 word noun-phrase candidates (simplified NLP heuristic)
      const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOPWORDS.has(w));

      // Single-word candidates
      words.forEach(w => candidates.set(w, (candidates.get(w) || 0) + weight));

      // Two-word phrases
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;
        candidates.set(phrase, (candidates.get(phrase) || 0) + weight * 1.5);
      }
    };

    if (title) addTerms(title, 4);
    h1s.forEach(h => addTerms(h.text, 3));
    addTerms(introText, 2);
    addTerms(headingText, 1.5);

    // Sort by weight, return top 5
    return Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term]) => term);
  }

  private buildSemanticAnalysis(data: {
    targetKeywordProvided: boolean;
    inferredPrimaryTopic: string | null;
    topicConfidence: number | null;
    semanticCoverageScore: number;
    missingTopics: string[];
    recommendedHeadings: string[];
    missingLsiTerms?: string[];
    missingEntities?: string[];
    provider?: string | undefined;
  }): Record<string, unknown> {
    return data;
  }

  private getStatus(score: number): ScoreModuleResult['status'] {
    if (score >= this.maxScore - 1) return 'excellent';
    if (score >= this.maxScore * 0.7) return 'good';
    if (score >= this.maxScore * 0.45) return 'needs_improvement';
    if (score > 0) return 'poor';
    return 'critical';
  }
}

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'what', 'when', 'were',
  'they', 'their', 'there', 'been', 'more', 'also', 'into', 'some', 'your',
  'about', 'which', 'would', 'could', 'these', 'those', 'other', 'than',
  'then', 'such', 'just', 'very', 'each', 'most', 'many', 'much',
]);
