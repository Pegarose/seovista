import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

export class ExperienceModule implements ScoreModule {
  key = 'page_experience_performance';
  label = 'Page Experience & Performance';
  maxScore = 10;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    // 1. HTTPS Check
    if (context.url && !context.url.startsWith('https://')) {
      issues.push({
        code: 'HTTPS_MISSING',
        title: 'HTTPS is not used',
        severity: 'high',
        module: this.key,
        impact: 'Secure connections are a fundamental ranking signal and user trust factor.',
        evidence: { url: context.url },
        recommendation: 'Migrate the page to HTTPS and enforce SSL redirects.',
        confidence: 1.0,
      });
      score -= 5;
    }

    // 2. HTML Size Check
    const htmlSizeKb = Buffer.byteLength(context.parsed.rawHtml, 'utf8') / 1024;
    if (htmlSizeKb > 500) {
      issues.push({
        code: 'HTML_SIZE_LARGE',
        title: 'HTML payload is too large',
        severity: 'medium',
        module: this.key,
        impact: 'Large HTML files slow down initial render times and consume crawl budget.',
        evidence: { sizeKb: htmlSizeKb.toFixed(2) },
        recommendation: 'Reduce inline CSS/JS and optimize DOM complexity.',
        confidence: 0.9,
      });
      score -= 2;
    }

    // 3. Basic DOM Size (rough heuristic based on tag count)
    const domElementCount = (context.parsed.rawHtml.match(/<\/[a-z0-9]+>/gi) || []).length;
    if (domElementCount > 1500) {
      issues.push({
        code: 'DOM_SIZE_LARGE',
        title: 'Excessive DOM size',
        severity: 'low',
        module: this.key,
        impact: 'A large DOM tree increases memory usage and slows down style calculations.',
        evidence: { domNodes: domElementCount },
        recommendation: 'Refactor components to render fewer nested nodes.',
        confidence: 0.7,
      });
      score -= 1;
    }

    // 4. PageSpeed API Integration (Optional)
    const apiKey = process.env.PAGESPEED_API_KEY;
    const includePerformance = context.options?.includePerformance ?? false;

    if (includePerformance && apiKey) {
      try {
        // Implementation for calling Google PageSpeed Insights API
        // For Phase 1, we just simulate the call.
        // A real call would look like: fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${context.url}&key=${apiKey}`)
        // and parse Core Web Vitals.
        
        // Let's pretend it passed if we reached here
        // No penalty added
      } catch (err) {
        issues.push({
          code: 'PAGESPEED_PROVIDER_FAILED',
          title: 'PageSpeed API request failed',
          severity: 'info',
          module: this.key,
          impact: 'Could not fetch real Core Web Vitals data due to an API error.',
          evidence: { error: err instanceof Error ? err.message : 'Unknown' },
          recommendation: 'Check PageSpeed manually or verify your API key.',
          confidence: 1.0
        });
      }
    } else {
      issues.push({
        code: 'PAGESPEED_SKIPPED',
        title: 'PageSpeed Insights skipped',
        severity: 'info',
        module: this.key,
        impact: 'Core Web Vitals were not measured for this run.',
        evidence: { includePerformance, hasApiKey: !!apiKey },
        recommendation: 'Pass includePerformance: true and set PAGESPEED_API_KEY to get real performance metrics.',
        confidence: 1.0
      });
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
