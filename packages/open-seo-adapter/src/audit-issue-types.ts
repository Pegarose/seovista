/**
 * SeoVista Audit Issue Type Registry
 *
 * Adapted from every-app/open-seo (v0.0.25, MIT)
 * Upstream: src/shared/audit-issues.ts
 * Commit: 3f2b4872caef809f0280a765f9eb469e8a6b523a
 *
 * Typed registry of technical SEO issue descriptors for use by the
 * audit-core package and future site-audit engine.
 *
 * @owner SeoVista Foundation Team
 * @review Accepted — Sprint 0 adaptation boundary
 */

import { z } from 'zod';

export const SeovistaIssueSeverityValues = {
  Critical: 'critical',
  Warning: 'warning',
  Info: 'info',
} as const;

export type SeovistaIssueSeverity =
  (typeof SeovistaIssueSeverityValues)[keyof typeof SeovistaIssueSeverityValues];

export const SeovistaSeverityOrder: Record<SeovistaIssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface SeovistaAuditIssueDescriptor {
  readonly severity: SeovistaIssueSeverity;
  readonly title: string;
  readonly explanation: string;
  readonly howToFix: string;
}

export const SeovistaAuditIssueTypeValues = {
  BlockedPage: 'blocked-page',
  ServerError: 'server-error',
  BrokenInternalLink: 'broken-internal-link',
  MissingTitle: 'missing-title',
  BrokenPage: 'broken-page',
  DuplicateTitle: 'duplicate-title',
  DuplicateMetaDescription: 'duplicate-meta-description',
  DuplicateContent: 'duplicate-content',
  MissingMetaDescription: 'missing-meta-description',
  MissingH1: 'missing-h1',
  MultipleH1: 'multiple-h1',
  RedirectChain: 'redirect-chain',
  RedirectLoop: 'redirect-loop',
  CanonicalConflict: 'canonical-conflict',
  ThinContent: 'thin-content',
  ImagesMissingAlt: 'images-missing-alt',
  OrphanPage: 'orphan-page',
  NoOutgoingLinks: 'no-outgoing-links',
  TitleTooLong: 'title-too-long',
  TitleTooShort: 'title-too-short',
  MetaDescriptionTooLong: 'meta-description-too-long',
  MetaDescriptionTooShort: 'meta-description-too-short',
  HeadingOrderSkip: 'heading-order-skip',
  SlowResponse: 'slow-response',
  NoindexPage: 'noindex-page',
  CanonicalizedPage: 'canonicalized-page',
  DeepPage: 'deep-page',
} as const;

export type SeovistaAuditIssueType =
  (typeof SeovistaAuditIssueTypeValues)[keyof typeof SeovistaAuditIssueTypeValues];

const issueDescriptorSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().min(1),
  explanation: z.string().min(1),
  howToFix: z.string().min(1),
}) satisfies z.ZodType<SeovistaAuditIssueDescriptor>;

const issueRegistry: Readonly<
  Record<SeovistaAuditIssueType, SeovistaAuditIssueDescriptor>
> = Object.freeze({
  'blocked-page': {
    severity: 'critical',
    title: 'Crawler was blocked',
    explanation:
      'The site returned a bot challenge or access denial (e.g. a Cloudflare challenge, 403, or 429) instead of the page. We report this honestly rather than pretending the page is broken — but it means this page could not be audited, and other crawlers like search engines may face similar friction.',
    howToFix:
      'If you own this site, allowlist the audit user agent in your WAF/bot-protection settings. Then re-run the audit.',
  },
  'server-error': {
    severity: 'critical',
    title: 'Server error (5xx)',
    explanation:
      'The page returned a 5xx server error. Search engines that repeatedly see server errors will crawl the site less and may drop the page from the index.',
    howToFix:
      'Check the server logs for this URL and fix the underlying error. If the page is gone, return a 404/410 or redirect it to a relevant page instead of erroring.',
  },
  'broken-internal-link': {
    severity: 'critical',
    title: 'Broken internal link',
    explanation:
      'This page links to an internal URL that returns an error status (4xx/5xx). Broken links waste crawl budget, leak link equity, and frustrate users.',
    howToFix:
      'Update the link to point at the correct live URL, or remove it. If the target was moved, prefer linking directly to the new URL rather than relying on a redirect.',
  },
  'missing-title': {
    severity: 'critical',
    title: 'Missing title tag',
    explanation:
      'The page has no <title>. The title is the strongest on-page relevance signal and the headline shown in search results.',
    howToFix:
      'Add a unique, descriptive <title> of roughly 50–60 characters that includes the primary topic.',
  },
  'broken-page': {
    severity: 'warning',
    title: 'Page returns an error (4xx)',
    explanation:
      'This crawled URL returned a client error (e.g. 404). If it is referenced from your sitemap or other pages, crawlers keep wasting requests on it.',
    howToFix:
      'If the page should exist, restore it. If it is intentionally gone, remove it from the sitemap and internal links, and consider a 301 redirect to the closest live page.',
  },
  'duplicate-title': {
    severity: 'warning',
    title: 'Duplicate title',
    explanation:
      'Multiple pages share the same title tag. Search engines use titles to differentiate pages; duplicates make pages compete with each other and depress click-through rates.',
    howToFix:
      'Write a unique title for each page describing its specific content. For templated pages, include the distinguishing attribute in the template.',
  },
  'duplicate-meta-description': {
    severity: 'warning',
    title: 'Duplicate meta description',
    explanation:
      'Multiple pages share the same meta description, so search results show identical snippets and users cannot tell the pages apart.',
    howToFix:
      'Write a unique meta description per page, or remove the duplicated one entirely — search engines will generate a snippet from page content.',
  },
  'duplicate-content': {
    severity: 'warning',
    title: 'Duplicate page content',
    explanation:
      'Two or more URLs serve byte-identical visible text. Search engines pick one version to index and ignore the rest, and ranking signals get split across the duplicates.',
    howToFix:
      'Consolidate duplicates: pick the canonical URL, add rel=canonical from the others, and 301-redirect duplicate URLs where possible.',
  },
  'missing-meta-description': {
    severity: 'warning',
    title: 'Missing meta description',
    explanation:
      'The page has no meta description. Search engines will assemble a snippet from page text, which is often less compelling and hurts click-through rate.',
    howToFix:
      'Add a meta description of roughly 70–160 characters that summarizes the page and gives a reason to click.',
  },
  'missing-h1': {
    severity: 'warning',
    title: 'Missing H1 heading',
    explanation:
      'The page has no H1. The H1 tells users and search engines what the page is about; pages without one tend to have weaker topical clarity.',
    howToFix:
      'Add a single H1 that states the main topic, consistent with the title tag.',
  },
  'multiple-h1': {
    severity: 'warning',
    title: 'Multiple H1 headings',
    explanation:
      'The page has more than one H1, which dilutes the main-topic signal and usually indicates a templating mistake.',
    howToFix:
      'Keep one H1 for the main heading and demote the others to H2/H3.',
  },
  'redirect-chain': {
    severity: 'warning',
    title: 'Redirect chain',
    explanation:
      'Reaching the final page requires two or more consecutive redirects. Each hop adds latency, leaks link equity, and burns crawl budget.',
    howToFix:
      'Point the first URL (and any internal links) directly at the final destination so there is at most one redirect.',
  },
  'redirect-loop': {
    severity: 'warning',
    title: 'Redirect loop',
    explanation:
      'This redirect eventually points back to itself, so the URL never resolves. Browsers and crawlers give up with an error.',
    howToFix:
      'Trace the redirect rules for this URL and break the cycle so the chain terminates at a real 200 page.',
  },
  'canonical-conflict': {
    severity: 'warning',
    title: 'Conflicting canonical signals',
    explanation:
      'The page declares different canonical URLs in its HTML <link rel=canonical> and its HTTP Link header. When signals conflict, search engines ignore both and choose their own canonical.',
    howToFix:
      'Pick one canonical URL and declare it in exactly one place (HTML head is the most common); remove or align the other declaration.',
  },
  'thin-content': {
    severity: 'warning',
    title: 'Thin content',
    explanation:
      'The page has very little visible text. Thin pages rarely rank and can drag down sitewide quality assessments.',
    howToFix:
      'Either expand the page with genuinely useful content, noindex it, or consolidate it into a stronger page.',
  },
  'images-missing-alt': {
    severity: 'warning',
    title: 'Images missing alt text',
    explanation:
      'One or more images on the page lack alt attributes. Alt text is an accessibility requirement and the main way search engines understand images.',
    howToFix:
      'Add descriptive alt text to meaningful images; use an empty alt (alt="") only for purely decorative ones.',
  },
  'orphan-page': {
    severity: 'warning',
    title: 'Orphan page',
    explanation:
      'No crawled page links to this URL — it was only discoverable via the sitemap. Pages without internal links receive little crawl attention.',
    howToFix:
      'Link to this page from relevant pages (navigation, related content, hub pages), or remove it from the sitemap if it should not be indexed.',
  },
  'no-outgoing-links': {
    severity: 'warning',
    title: 'Page has no outgoing links',
    explanation:
      'The page contains no links at all — a dead end. Link equity that flows into it stops there, crawlers have nowhere to go next.',
    howToFix:
      'Add links to related pages, the parent category, or the homepage.',
  },
  'title-too-long': {
    severity: 'info',
    title: 'Title too long',
    explanation:
      'The title exceeds ~60 characters, so search results will truncate it.',
    howToFix:
      'Shorten the title to roughly 50–60 characters, front-loading the most important words.',
  },
  'title-too-short': {
    severity: 'info',
    title: 'Title too short',
    explanation:
      'The title is under ~10 characters, which is usually too generic to describe the page or attract clicks.',
    howToFix:
      'Expand the title into a descriptive phrase (roughly 30–60 characters) that states what the page offers.',
  },
  'meta-description-too-long': {
    severity: 'info',
    title: 'Meta description too long',
    explanation:
      'The meta description exceeds ~160 characters, so search engines will truncate the snippet.',
    howToFix:
      'Trim the description to roughly 70–160 characters while keeping the core message and call to action.',
  },
  'meta-description-too-short': {
    severity: 'info',
    title: 'Meta description too short',
    explanation:
      'The meta description is under ~70 characters. Short descriptions waste the snippet space search results give you.',
    howToFix:
      'Expand the description to roughly 70–160 characters that summarize the page and give a reason to click.',
  },
  'heading-order-skip': {
    severity: 'info',
    title: 'Heading levels skip',
    explanation:
      'The heading hierarchy skips levels (e.g. an H4 directly after an H2). This weakens document structure for accessibility tools and content parsing.',
    howToFix:
      'Adjust heading levels so they descend one step at a time (H1 → H2 → H3) without skipping.',
  },
  'slow-response': {
    severity: 'info',
    title: 'Slow server response',
    explanation:
      'The HTML response took over 1.5 seconds. Slow time-to-first-byte drags down every downstream performance metric and reduces crawl rate.',
    howToFix:
      'Investigate server/database time and caching for this route; serving cached or statically generated HTML usually fixes it.',
  },
  'noindex-page': {
    severity: 'info',
    title: 'Page is noindex',
    explanation:
      'The page asks search engines not to index it (via robots meta tag or X-Robots-Tag header). This is often intentional — a heads-up, not an error.',
    howToFix:
      'If this page should rank, remove the noindex directive. If intentional (admin, thank-you, filter pages), no action is needed.',
  },
  'canonicalized-page': {
    severity: 'info',
    title: 'Canonicalized to another URL',
    explanation:
      'The page declares a different URL as its canonical, telling search engines to index that URL instead. Fine when intentional — a problem if this page was meant to rank.',
    howToFix:
      'If this page should rank on its own, set its canonical to itself. Otherwise no action is needed.',
  },
  'deep-page': {
    severity: 'info',
    title: 'Page is deep in the site structure',
    explanation:
      'The page is 5+ clicks from the homepage. Deep pages get crawled less often and receive less link equity.',
    howToFix:
      'Add links from higher-level pages (hubs, category pages, navigation) to flatten the path to this page.',
  },
});

const SeovistaIssueSeveritySchema = z.enum(['critical', 'warning', 'info']);

export { issueDescriptorSchema, SeovistaIssueSeveritySchema };

export function getSeovistaIssueDescriptor(
  issueType: string,
): SeovistaAuditIssueDescriptor | null {
  return (
    issueRegistry[issueType as SeovistaAuditIssueType] ?? null
  );
}

export function getSeovistaAllIssueTypes(): Readonly<
  Record<SeovistaAuditIssueType, SeovistaAuditIssueDescriptor>
> {
  return issueRegistry;
}

export function getSeovistaIssueTypeKeys(): readonly SeovistaAuditIssueType[] {
  return Object.keys(issueRegistry) as SeovistaAuditIssueType[];
}
