import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

export class LinkingModule implements ScoreModule {
  key = 'internal_linking_architecture';
  label = 'Internal Linking & Architecture';
  maxScore = 10;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    const { links } = context.parsed;
    let internalCount = 0;
    let externalCount = 0;
    let genericCount = 0;
    let emptyCount = 0;

    const genericAnchors = new Set([
      'click here', 'read more', 'learn more', 'more', 'here',
      'tıklayın', 'buraya tıklayın', 'devamı', 'daha fazla', 'incele'
    ]);

    // Simple heuristic to differentiate internal vs external.
    // We assume context.url is the base url if absolute paths are used,
    // and relative paths (starting with / or #) are internal.
    let baseDomain = '';
    if (context.url) {
      try {
        baseDomain = new URL(context.url).hostname;
      } catch (e) {
        // ignore
      }
    }

    links.forEach(link => {
      const href = link.href.trim();
      const text = link.text.trim().toLowerCase();

      // Skip empty or anchor-only links
      if (!href || href === '#' || href.startsWith('javascript:')) return;

      let isInternal = false;
      if (href.startsWith('/') || href.startsWith('?')) {
        isInternal = true;
      } else if (href.startsWith('http')) {
        try {
          const linkDomain = new URL(href).hostname;
          if (baseDomain && linkDomain === baseDomain) {
            isInternal = true;
          }
        } catch (e) {
          // ignore
        }
      }

      if (isInternal) internalCount++;
      else externalCount++;

      if (text === '') emptyCount++;
      else if (genericAnchors.has(text)) genericCount++;
    });

    if (internalCount === 0) {
      issues.push({
        code: 'NO_INTERNAL_LINKS',
        title: 'No internal links found on the page',
        severity: 'high',
        module: this.key,
        impact: 'Pages without internal links create dead ends for users and crawler bots.',
        evidence: { internalLinks: internalCount },
        recommendation: 'Add contextual links to other relevant pages on your site.',
        confidence: 0.9,
      });
      score -= 5;
    }

    if (genericCount > 0) {
      issues.push({
        code: 'GENERIC_ANCHOR_TEXT',
        title: 'Generic anchor text detected',
        severity: 'medium',
        module: this.key,
        impact: 'Generic anchors like "click here" lose semantic context and fail accessibility standards.',
        evidence: { genericLinkCount: genericCount },
        recommendation: 'Use descriptive anchor text that explains the destination content.',
        confidence: 1.0,
      });
      score -= 2;
    }

    if (emptyCount > 0) {
      issues.push({
        code: 'EMPTY_ANCHOR_TEXT',
        title: 'Empty anchor text detected',
        severity: 'low',
        module: this.key,
        impact: 'Links without text (or missing alt attributes on image links) cannot be crawled properly.',
        evidence: { emptyLinkCount: emptyCount },
        recommendation: 'Ensure all <a> tags contain descriptive text or images with alt text.',
        confidence: 0.9,
      });
      score -= 1;
    }

    if (externalCount > 100) {
      issues.push({
        code: 'EXCESSIVE_EXTERNAL_LINKS',
        title: 'Excessive external links',
        severity: 'low',
        module: this.key,
        impact: 'Too many external links can dilute page authority and look spammy.',
        evidence: { externalLinks: externalCount },
        recommendation: 'Audit your external links and ensure they are editorially justified.',
        confidence: 0.8,
      });
      score -= 2;
    }

    let status: ScoreModuleResult['status'] = 'good';
    if (score === this.maxScore) status = 'excellent';
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
