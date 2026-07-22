import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

export class ContentModule implements ScoreModule {
  key = 'content_quality_intent';
  label = 'Content Quality & Intent';
  maxScore = 20;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    const text = context.parsed.textContent || '';
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // 1. Structure Quality (Headings, Lists, Tables)
    const headings = { h2: context.parsed.headings.filter(h => h.level === 2), h3: context.parsed.headings.filter(h => h.level === 3), h4: context.parsed.headings.filter(h => h.level === 4) };
    const totalHeadings = (headings.h2?.length || 0) + (headings.h3?.length || 0) + (headings.h4?.length || 0);
    
    // Heuristic: Does the page use lists or tables?
    const hasListOrTable = context.parsed.rawHtml.includes('<ul') || context.parsed.rawHtml.includes('<ol') || context.parsed.rawHtml.includes('<table');
    
    let structureScore = 5;
    if (totalHeadings === 0 && wordCount > 300) {
      issues.push({
        code: 'LOW_STRUCTURE_QUALITY',
        title: 'Poor content structure (Missing Subheadings)',
        severity: 'high',
        module: this.key,
        impact: 'Large blocks of text without subheadings are difficult for users to read and for bots to parse topics.',
        evidence: { wordCount, totalHeadings },
        recommendation: 'Break up the content using H2 and H3 subheadings.',
        confidence: 0.9,
      });
      structureScore -= 3;
    }

    if (!hasListOrTable && wordCount > 600 && context.pageType === 'article') {
      issues.push({
        code: 'NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC',
        title: 'Lack of lists or tables for formatting',
        severity: 'medium',
        module: this.key,
        impact: 'Articles lacking structured formatting miss out on Featured Snippet opportunities (Lists/Tables).',
        evidence: { hasListOrTable, wordCount },
        recommendation: 'Use bullet points, numbered lists, or tables to summarize key steps or data.',
        confidence: 0.8,
      });
      structureScore -= 2;
    }
    score -= (5 - Math.max(0, structureScore));

    // 2. Thin Content Risk (Combination of length and structure)
    let isThinContent = false;
    let thinSeverity: AuditIssue['severity'] = 'critical';
    let thinPenalty = 8;

    if (context.pageType === 'article' && wordCount < 300) {
      isThinContent = true;
    } else if ((context.pageType === 'product' || context.pageType === 'landing') && wordCount < 30) {
      // Products/landings can be very visual. Only flag if extremely empty.
      isThinContent = true;
      thinSeverity = 'medium';
      thinPenalty = 3;
    } else if (wordCount < 100 && totalHeadings === 0) {
      isThinContent = true; 
      thinSeverity = 'high';
      thinPenalty = 5;
    }

    if (isThinContent) {
      issues.push({
        code: 'THIN_CONTENT_RISK',
        title: 'Thin content detected',
        severity: thinSeverity,
        module: this.key,
        impact: 'Search engines often demote pages that provide little or no added value/content.',
        evidence: { wordCount, pageType: context.pageType || 'unknown' },
        recommendation: 'Expand the page content to fully satisfy user intent.',
        confidence: 0.9,
      });
      score -= thinPenalty;
    }

    // 3. Intro Clarity
    // Heuristic: Does the first paragraph contain the target keyword? (If provided)
    if (context.targetKeyword) {
      const keywordLower = context.targetKeyword.toLowerCase();
      const first100Words = words.slice(0, 100).join(' ').toLowerCase();
      
      if (!first100Words.includes(keywordLower)) {
        const isProductOrLanding = context.pageType === 'product' || context.pageType === 'landing';
        const severityStr = isProductOrLanding ? 'info' : 'medium';
        const penalty = isProductOrLanding ? 0 : 3;

        issues.push({
          code: 'INTRO_MISSING_OR_WEAK',
          title: 'Target topic missing from introduction',
          severity: severityStr,
          module: this.key,
          impact: 'Mentioning the core topic early helps establish immediate relevance for users and bots.',
          evidence: { targetKeyword: context.targetKeyword },
          recommendation: isProductOrLanding 
            ? 'Consider ensuring the product/offer name is prominent above the fold.'
            : 'Naturally include your target keyword or core topic within the first paragraph.',
          confidence: 0.8,
        });
        score -= penalty;
      }
    }

    // 4. Keyword Stuffing Risk
    if (context.targetKeyword && wordCount > 0) {
      const keywordLower = context.targetKeyword.toLowerCase();
      const textLower = text.toLowerCase();
      const occurrences = (textLower.match(new RegExp(keywordLower, 'g')) || []).length;
      const keywordDensity = occurrences / wordCount;

      if (keywordDensity > 0.05) { // > 5% is a very high density heuristic
        issues.push({
          code: 'KEYWORD_STUFFING_RISK',
          title: 'High keyword density (Stuffing Risk)',
          severity: 'high',
          module: this.key,
          impact: 'Over-optimizing content with repeated keywords can trigger spam penalties.',
          evidence: { density: `${(keywordDensity * 100).toFixed(1)}%`, occurrences, wordCount },
          recommendation: 'Reduce repetitions of the exact match keyword and use semantic variations.',
          confidence: 0.9,
        });
        score -= 5;
      }
    }

    // 5. Search Intent Mismatch Risk (Basic Heuristic)
    if (context.targetKeyword && context.pageType) {
      const keywordLower = context.targetKeyword.toLowerCase();
      const isInformational = keywordLower.includes('how') || keywordLower.includes('what') || keywordLower.includes('guide');
      // const isTransactional = keywordLower.includes('buy') || keywordLower.includes('price');

      if (isInformational && context.pageType === 'product') {
        issues.push({
          code: 'CONTENT_INTENT_MISMATCH_RISK',
          title: 'Potential intent mismatch (Informational query on Product page)',
          severity: 'medium',
          module: this.key,
          impact: 'Users searching for "how-to" expect articles, not product purchase pages.',
          evidence: { targetKeyword: context.targetKeyword, pageType: context.pageType },
          recommendation: 'Consider creating a dedicated blog post for this query instead of targeting it on a product page.',
          confidence: 0.7,
        });
        score -= 2;
      }
    }

    // Map status
    let status: ScoreModuleResult['status'] = 'good';
    if (score >= this.maxScore - 2) status = 'excellent';
    else if (score >= this.maxScore * 0.7) status = 'good';
    else if (score >= this.maxScore * 0.4) status = 'needs_improvement';
    else if (score > 0) status = 'poor';
    else status = 'critical';

    return {
      key: this.key,
      label: this.label,
      score: Math.max(0, score),
      maxScore: this.maxScore,
      status,
      issues,
      recommendations: []
    };
  }
}
