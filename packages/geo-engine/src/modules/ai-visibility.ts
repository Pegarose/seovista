import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue, AiVisibilityData } from '../types';

export class AiVisibilityModule implements ScoreModule {
  key = 'ai_visibility_readiness';
  label = 'AI Visibility Readiness';
  maxScore = 5;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    const { parsed } = context;
    const bodyText = parsed.textContent || '';
    const rawHtml = parsed.rawHtml || '';

    // 1. Answerability (Presence of direct QA blocks / FAQs)
    const hasFaqSchema = parsed.jsonLd.some(ld => ld['@type'] === 'FAQPage' || (Array.isArray(ld) && ld.some(i => i['@type'] === 'FAQPage')));
    const hasQuestionHeadings = parsed.headings.some(h => h.text.includes('?') || h.text.toLowerCase().startsWith('how') || h.text.toLowerCase().startsWith('what'));
    const answerability = hasFaqSchema || hasQuestionHeadings ? 0.9 : 0.4;

    if (!hasFaqSchema && !hasQuestionHeadings) {
      issues.push({
        code: 'ANSWER_BLOCK_OPPORTUNITY',
        title: 'Content lacks clear question-and-answer blocks',
        severity: 'info',
        module: this.key,
        impact: 'Generative AI search engines favor concise, direct answers to common user questions.',
        evidence: { hasFaqSchema, hasQuestionHeadings },
        recommendation: 'Add an FAQ section or use headings phrased as questions immediately followed by direct, factual answers.',
        confidence: 0.8,
      });
      score -= 0.5;
    }

    // 2. Citation Readiness & Source Trust
    // Check outbound links to reputable sources (heuristic: wikipedia, .edu, .gov, or just presence of external links)
    const externalLinks = parsed.links.filter(l => !l.isInternal);
    const hasOutboundLinks = externalLinks.length > 0;
    const hasAuthorityLinks = externalLinks.some(l => l.href.includes('.edu') || l.href.includes('.gov') || l.href.includes('wikipedia.org'));
    
    let citationReadiness = 0.3;
    let sourceTrustSignals = 0.3;
    
    if (hasOutboundLinks) {
      citationReadiness = 0.7;
      sourceTrustSignals = 0.6;
      if (hasAuthorityLinks) {
        citationReadiness = 0.9;
        sourceTrustSignals = 0.9;
      }
    }

    if (!hasOutboundLinks) {
      issues.push({
        code: 'CITATION_READINESS_WEAK',
        title: 'Limited outbound source citations found',
        severity: 'experimental',
        module: this.key,
        impact: 'AI assistants like Perplexity prioritize content that cites authoritative external sources.',
        evidence: { externalLinkCount: externalLinks.length },
        recommendation: 'Link out to primary research, statistics, and reputable sources to justify claims.',
        confidence: 0.75,
      });
      score -= 1;
    }

    // 3. AI Parseability (Structured formatting)
    const hasListsOrTabular = rawHtml.includes('<ul') || rawHtml.includes('<ol') || rawHtml.includes('<table');
    const aiParseability = hasListsOrTabular ? 0.9 : 0.5;

    if (!hasListsOrTabular) {
      issues.push({
        code: 'AI_PARSEABILITY_RISK',
        title: 'Lack of structured formatting (lists or tables)',
        severity: 'experimental',
        module: this.key,
        impact: 'Structured formatting makes granular details easier for LLMs to extract and synthesize.',
        evidence: { hasListsOrTabular: false },
        recommendation: 'Use tables, bullet lists, and summary paragraphs to present data clearly.',
        confidence: 0.85,
      });
      score -= 0.5;
    }

    // 4. Entity Clarity
    // Very basic heuristic: presence of proper nouns (capitalized words not at sentence start)
    // For Phase 1, we just estimate based on word count / structural clarity
    const wordCount = bodyText.split(/\s+/).length;
    const entityClarity = wordCount > 300 ? 0.7 : 0.4;
    
    if (entityClarity < 0.5) {
      issues.push({
        code: 'ENTITY_CLARITY_WEAK',
        title: 'Topic entities are not clearly defined',
        severity: 'experimental',
        module: this.key,
        impact: 'AI models rely on clear, explicit entity relationships to build knowledge graphs.',
        evidence: { wordCount },
        recommendation: 'Use clear, unambiguous terminology and define key concepts explicitly in the text.',
        confidence: 0.6,
      });
      score -= 0.5;
    }

    // Third party mention data (Placeholder logic)
    issues.push({
      code: 'THIRD_PARTY_MENTION_DATA_UNAVAILABLE',
      title: 'Third-party brand mention data is unavailable',
      severity: 'info',
      module: this.key,
      impact: 'AI visibility heavily relies on how frequently your brand is mentioned across the web. This data requires external provider integration.',
      evidence: {},
      recommendation: 'Ensure your brand is mentioned on authoritative industry sites, forums, and directories.',
      confidence: 1.0,
    });

    // 5. Platform Readiness
    const platformReadiness: AiVisibilityData['platformReadiness'] = [
      {
        platform: 'ChatGPT',
        score: Math.round((answerability + entityClarity) / 2 * 100),
        confidence: 0.7,
        rationale: 'ChatGPT favors clear definitions, structured answers, and distinct entities.',
        experimental: true
      },
      {
        platform: 'Perplexity',
        score: Math.round((citationReadiness + sourceTrustSignals) / 2 * 100),
        confidence: 0.8,
        rationale: 'Perplexity heavily indexes on cited sources, outbound authority links, and factual density.',
        experimental: true
      },
      {
        platform: 'Google AI Overviews',
        score: Math.round((answerability + aiParseability) / 2 * 100),
        confidence: 0.75,
        rationale: 'Google AIO readiness is estimated from indexable, well-structured HTML, concise answer blocks, helpful content signals, semantic coverage, and valid page-type structured data such as Article, WebPage, BreadcrumbList, Product, or Organization where relevant.',
        experimental: true
      },
      {
        platform: 'Bing Copilot',
        score: Math.round((citationReadiness + answerability) / 2 * 100),
        confidence: 0.7,
        rationale: 'Bing Copilot relies on Bing index data, prioritizing direct answers and cited web results.',
        experimental: true
      }
    ];

    const overallReadinessScore = platformReadiness.reduce((acc, curr) => acc + curr.score, 0) / platformReadiness.length;

    if (overallReadinessScore < 60) {
      issues.push({
        code: 'PLATFORM_READINESS_LIMITED',
        title: 'Limited AI Platform Readiness',
        severity: 'experimental',
        module: this.key,
        impact: 'Your content may struggle to be cited or summarized by major AI assistants.',
        evidence: { overallScore: overallReadinessScore },
        recommendation: 'Focus on improving answerability, adding authoritative citations, and structuring your content.',
        confidence: 0.8,
      });
    }

    const aiVisibilityData: AiVisibilityData = {
      answerability,
      citationReadiness,
      entityClarity,
      aiParseability,
      sourceTrustSignals,
      platformReadiness
    };

    return {
      key: this.key,
      label: this.label,
      score: Math.max(0, score),
      maxScore: this.maxScore,
      status: this.getStatus(score),
      issues,
      recommendations: [],
      aiVisibilityData
    };
  }

  private getStatus(score: number): ScoreModuleResult['status'] {
    if (score >= this.maxScore - 0.5) return 'excellent';
    if (score >= this.maxScore * 0.7) return 'good';
    if (score >= this.maxScore * 0.45) return 'needs_improvement';
    if (score > 0) return 'poor';
    return 'critical';
  }
}
