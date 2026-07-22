import { ScoreModule, ScoreContext, ScoreModuleResult, AuditIssue } from '../types';

export class TechnicalModule implements ScoreModule {
  key = 'technical_seo_metadata';
  label = 'Technical SEO & Metadata';
  maxScore = 20;

  async run(context: ScoreContext): Promise<ScoreModuleResult> {
    const issues: AuditIssue[] = [];
    let score = this.maxScore;

    const { title, metaDescription: description, headings, jsonLd, og, twitter } = context.parsed;

    // 1. Title Checks
    if (!title) {
      issues.push({
        code: 'TITLE_MISSING',
        title: 'Title tag is missing',
        severity: 'critical',
        module: this.key,
        impact: 'Search engines heavily rely on the title tag to understand page topic.',
        evidence: {},
        recommendation: 'Add a descriptive <title> tag between 50-60 characters.',
        confidence: 1.0,
      });
      score -= 5;
    } else {
      if (title.length < 30) {
        issues.push({
          code: 'TITLE_TOO_SHORT',
          title: 'Title tag is too short',
          severity: 'medium',
          module: this.key,
          impact: 'Short titles miss opportunities to include relevant secondary keywords.',
          evidence: { title, length: title.length },
          recommendation: 'Expand the title to 50-60 characters with relevant terms.',
          confidence: 0.9,
        });
        score -= 2;
      } else if (title.length > 65) {
        issues.push({
          code: 'TITLE_TOO_LONG',
          title: 'Title tag is too long',
          severity: 'low',
          module: this.key,
          impact: 'Long titles get truncated in search results, reducing click-through rates.',
          evidence: { title, length: title.length },
          recommendation: 'Reduce title length to under 60 characters.',
          confidence: 0.9,
        });
        score -= 1;
      }
    }

    // 2. Meta Description Checks
    if (!description) {
      issues.push({
        code: 'META_DESCRIPTION_MISSING',
        title: 'Meta description is missing',
        severity: 'high',
        module: this.key,
        impact: 'Descriptions drive click-through rates from search engine results pages.',
        evidence: {},
        recommendation: 'Add a compelling <meta name="description"> tag between 120-160 characters.',
        confidence: 1.0,
      });
      score -= 3;
    } else {
      if (description.length < 70) {
        issues.push({
          code: 'META_DESCRIPTION_TOO_SHORT',
          title: 'Meta description is too short',
          severity: 'medium',
          module: this.key,
          impact: 'Short descriptions fail to fully persuade users to click your link.',
          evidence: { description, length: description.length },
          recommendation: 'Expand description to 120-160 characters outlining the page value.',
          confidence: 0.9,
        });
        score -= 1;
      } else if (description.length > 165) {
        issues.push({
          code: 'META_DESCRIPTION_TOO_LONG',
          title: 'Meta description is too long',
          severity: 'low',
          module: this.key,
          impact: 'Descriptions over 160 characters will be truncated by search engines.',
          evidence: { description, length: description.length },
          recommendation: 'Keep the description under 160 characters for desktop and 120 for mobile.',
          confidence: 0.9,
        });
        score -= 1;
      }
    }

    // 3. H1 Checks
    const h1s = headings.filter(h => h.level === 1);
    if (h1s.length === 0) {
      issues.push({
        code: 'H1_MISSING',
        title: 'H1 heading is missing',
        severity: 'high',
        module: this.key,
        impact: 'The H1 tag is the most important on-page structural element for topic clarity.',
        evidence: {},
        recommendation: 'Add exactly one <h1> tag containing the primary topic.',
        confidence: 1.0,
      });
      score -= 3;
    } else if (h1s.length > 1) {
      // HTML5 sectioning or documentation allows multiple H1s
      const htmlText = context.parsed.rawHtml || '';
      const hasHtml5Sectioning = htmlText.includes('<article') || htmlText.includes('<section');
      const isDoc = context.pageType === 'documentation';
      const severityStr = (hasHtml5Sectioning || isDoc) ? 'info' : 'low';

      issues.push({
        code: 'MULTIPLE_H1',
        title: 'Multiple H1 headings detected',
        severity: severityStr,
        module: this.key,
        impact: 'While HTML5 allows multiple H1s, traditional SEO best practices recommend exactly one to establish clear hierarchy.',
        evidence: { count: h1s.length, h1s: h1s.slice(0, 3) },
        recommendation: 'Change secondary H1 tags to H2 or H3 tags, unless using strict HTML5 sectioning elements like <article>.',
        confidence: 0.8,
      });

      if (severityStr === 'low') {
        score -= 1;
      }
    }

    // 4. Open Graph & Twitter Cards
    let ogScore = 2;
    if (!og || !og.title || !og.image) {
      issues.push({
        code: 'OPEN_GRAPH_INCOMPLETE',
        title: 'Open Graph metadata is incomplete',
        severity: 'low',
        module: this.key,
        impact: 'Missing OG tags hurt click-through rates when shared on social media (Facebook, LinkedIn).',
        evidence: { ogKeys: og ? Object.keys(og) : [] },
        recommendation: 'Add og:title, og:description, og:url, and og:image meta tags.',
        confidence: 1.0,
      });
      ogScore -= 1;
    }
    if (!twitter || !twitter.card) {
      issues.push({
        code: 'TWITTER_CARD_INCOMPLETE',
        title: 'Twitter Card metadata is incomplete',
        severity: 'low',
        module: this.key,
        impact: 'Tweets linking to this page will lack rich media previews.',
        evidence: { twitterKeys: twitter ? Object.keys(twitter) : [] },
        recommendation: 'Add twitter:card, twitter:title, and twitter:image meta tags.',
        confidence: 1.0,
      });
      ogScore -= 1;
    }
    score -= (2 - ogScore);

    // 5. JSON-LD and Schema Checks
    let schemaScore = 3;
    const schemas: any[] = [];
    let hasInvalidJson = false;

    if (jsonLd && jsonLd.length > 0) {
      for (const parsed of jsonLd) {
        if (parsed._error === 'INVALID_JSON') {
          hasInvalidJson = true;
          continue;
        }
        if (Array.isArray(parsed)) {
          schemas.push(...parsed);
        } else {
          schemas.push(parsed);
        }
      }
    }

    if (hasInvalidJson) {
      issues.push({
        code: 'JSON_LD_INVALID',
        title: 'Invalid JSON-LD syntax',
        severity: 'high',
        module: this.key,
        impact: 'Search engines cannot parse structured data due to syntax errors.',
        evidence: {},
        recommendation: 'Validate your schema using the Google Rich Results Test tool.',
        confidence: 1.0,
      });
      schemaScore -= 2;
    }

    const schemaTypes = schemas.map(s => s['@type']).flat();
    const hasBreadcrumb = schemaTypes.includes('BreadcrumbList');
    const hasArticle = schemaTypes.includes('Article') || schemaTypes.includes('BlogPosting') || schemaTypes.includes('NewsArticle');
    const hasFAQ = schemaTypes.includes('FAQPage');

    if (!hasBreadcrumb) {
      issues.push({
        code: 'BREADCRUMB_SCHEMA_MISSING',
        title: 'BreadcrumbList schema is missing',
        severity: 'low',
        module: this.key,
        impact: 'Breadcrumb schema helps search engines understand site hierarchy and displays rich snippets.',
        evidence: { detectedSchemas: schemaTypes },
        recommendation: 'Implement BreadcrumbList JSON-LD to reflect the site navigation path.',
        confidence: 0.9,
      });
      schemaScore -= 0.5;
    }

    if (context.pageType === 'article' && !hasArticle) {
      issues.push({
        code: 'JSON_LD_MISSING_RECOMMENDED_SCHEMA',
        title: 'Article schema is recommended for this page type',
        severity: 'medium',
        module: this.key,
        impact: 'Article schema enables rich results like Top Stories carousels.',
        evidence: { pageType: context.pageType, detectedSchemas: schemaTypes },
        recommendation: 'Add Article or BlogPosting JSON-LD schema.',
        confidence: 0.9,
      });
      schemaScore -= 0.5;
    }

    // FAQPage logic: Never penalize for missing FAQPage, but suggest answer block.
    if (!hasFAQ) {
      issues.push({
        code: 'ANSWER_BLOCK_OPPORTUNITY',
        title: 'Consider adding a concise answer block for AI search visibility',
        severity: 'info',
        module: this.key,
        impact: 'Answer blocks or FAQs help capture "People Also Ask" and Generative AI answers.',
        evidence: { hasFaqSchema: false },
        recommendation: 'Add a direct question-and-answer paragraph block near the top of the content.',
        confidence: 0.8,
      });
      // No schema score deduction here.
    }

    score -= (3 - schemaScore);

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
