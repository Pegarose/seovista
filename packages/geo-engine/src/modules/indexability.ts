import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

export class IndexabilityModule implements ScoreModule {
  key = 'indexability_crawlability';
  label = 'Indexability & Crawlability';
  maxScore = 20;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    // 1. HTTP Status Checks
    if (context.parsed.statusCode) {
      if (context.parsed.statusCode >= 500) {
        issues.push({
          code: 'HTTP_5XX_DETECTED',
          title: 'Server Error (5xx)',
          severity: 'critical',
          module: this.key,
          impact: 'Search engines cannot crawl the page due to a server error.',
          evidence: { status: context.parsed.statusCode },
          recommendation: 'Check server logs to identify and resolve the crash or timeout.',
          confidence: 1.0,
        });
        score -= 20;
      } else if (context.parsed.statusCode >= 400) {
        issues.push({
          code: 'HTTP_4XX_DETECTED',
          title: 'Client Error (4xx)',
          severity: 'critical',
          module: this.key,
          impact: 'The page is returning a client error (e.g. 404, 403), preventing indexation.',
          evidence: { status: context.parsed.statusCode },
          recommendation: 'Fix broken links pointing to this page or restore the missing content.',
          confidence: 1.0,
        });
        score -= 20;
      } else if (context.parsed.statusCode !== 200) {
        issues.push({
          code: 'HTTP_STATUS_NOT_OK',
          title: 'Non-200 OK Status',
          severity: 'high',
          module: this.key,
          impact: 'Unexpected HTTP status might interfere with normal crawling.',
          evidence: { status: context.parsed.statusCode },
          recommendation: 'Ensure the primary URL returns a 200 OK status.',
          confidence: 1.0,
        });
        score -= 10;
      }
    }

    // 2. Robots Meta Checks
    const noindex = context.parsed.metaRobots?.noindex || false;
    const nofollow = context.parsed.metaRobots?.nofollow || false;

    if (noindex) {
      issues.push({
        code: 'NOINDEX_DETECTED',
        title: 'Robots meta noindex found',
        severity: 'critical',
        module: this.key,
        impact: 'The page explicitly instructs search engines not to index it.',
        evidence: { robots: context.parsed.metaRobots },
        recommendation: 'Remove the noindex directive if this page should be searchable.',
        confidence: 1.0,
      });
      score -= 20;
    }

    if (nofollow) {
      issues.push({
        code: 'NOFOLLOW_DETECTED',
        title: 'Robots meta nofollow found',
        severity: 'high',
        module: this.key,
        impact: 'Search engines will not crawl links on this page, weakening site architecture discovery.',
        evidence: { robots: context.parsed.metaRobots },
        recommendation: 'Change nofollow to index, follow unless these links are untrusted.',
        confidence: 1.0,
      });
      score -= 10;
    }

    // 3. Canonical Validation
    if (!context.parsed.canonical) {
      issues.push({
        code: 'CANONICAL_MISSING',
        title: 'Canonical URL is missing',
        severity: 'high',
        module: this.key,
        impact: 'Without a canonical tag, duplicate content issues may arise from URL parameters.',
        evidence: {},
        recommendation: 'Add a self-referencing canonical tag to the head.',
        confidence: 0.9,
      });
      score -= 5;
    } else if (context.url) {
      try {
        const reqUrl = new URL(context.url);
        const canUrl = new URL(context.parsed.canonical);
        
        if (reqUrl.hostname !== canUrl.hostname) {
          issues.push({
            code: 'CANONICAL_DOMAIN_MISMATCH',
            title: 'Canonical points to a different domain',
            severity: 'high',
            module: this.key,
            impact: 'This page passes all ranking signals to an external domain.',
            evidence: { canonicalUrl: context.parsed.canonical, requestUrl: context.url },
            recommendation: 'Ensure the canonical domain is correct. If intentional, this is a cross-domain canonical.',
            confidence: 0.95,
          });
          score -= 10;
        } else if (reqUrl.pathname !== canUrl.pathname) {
          issues.push({
            code: 'CANONICAL_NON_SELF_REFERENCING',
            title: 'Canonical is not self-referencing',
            severity: 'info',
            module: this.key,
            impact: 'This page consolidates signals to another URL on the same site.',
            evidence: { canonicalUrl: context.parsed.canonical, requestUrl: context.url },
            recommendation: 'Verify if this page is an intentional duplicate. If it should rank independently, make the canonical self-referencing.',
            confidence: 0.95,
          });
        }
      } catch (e) {
        // Invalid URLs
      }
    }

    // 4. Content Visibility and CSR Detection
    const textContent = context.parsed.textContent || '';
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
    
    // CSR Indicators in standard SPAs
    const hasCsrRoots = context.parsed.rawHtml.includes('id="root"') || context.parsed.rawHtml.includes('id="__next"') || context.parsed.rawHtml.includes('id="app"');
    const hasLargeScripts = context.parsed.rawHtml.split('<script').length > 5; // Rough heuristic

    if (wordCount < 50) {
      if (hasCsrRoots || hasLargeScripts) {
        issues.push({
          code: 'CSR_RENDER_RISK',
          title: 'Client-Side Rendering architecture detected',
          severity: 'info',
          module: this.key,
          impact: 'The static HTML lacks content but contains JS mounting points. Search bots may struggle to index content if JS rendering fails.',
          evidence: { wordCount, hasCsrRoots, hasLargeScripts },
          recommendation: 'Implement Server-Side Rendering (SSR) or dynamic rendering for bots.',
          confidence: 0.8,
          implementationHint: 'This site uses CSR. Ensure search engine bots can render it.'
        });
        issues.push({
          code: 'STATIC_HTML_CONTENT_MISSING',
          title: 'Missing content in static HTML',
          severity: 'high',
          module: this.key,
          impact: 'Core content is not present in the initial HTML payload, introducing risk of poor indexation.',
          evidence: { wordCount },
          recommendation: 'Ensure critical content is present in the raw HTML response.',
          confidence: 0.9,
        });
        score -= 5;
      } else {
        issues.push({
          code: 'MAIN_CONTENT_EMPTY',
          title: 'Main content is empty or extremely short',
          severity: 'critical',
          module: this.key,
          impact: 'Search engines will not index pages without substantial content.',
          evidence: { wordCount },
          recommendation: 'Add meaningful text content to the page body.',
          confidence: 0.9,
        });
        score -= 15;
      }
    }

    // Map status
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
