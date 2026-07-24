import type { AuditIssue } from './types.js';

/**
 * Canonical, closed issue-tag vocabulary for the SeoVista geo-engine.
 *
 * This is the **single source of truth** for issue classification. Every
 * {@link AuditIssue} emitted by the 7 scoring modules (and the NeuronWriter
 * enrichment surface in `engine.ts`) is mapped to one or more members of this
 * union via {@link CODE_TO_TAGS}. The Crew service catalog
 * (`target_issue_tags`) and the recommendation matcher reference this same
 * union, so there is exactly one vocabulary across issues, catalog, and
 * matcher.
 *
 * Do NOT scatter tag literals across the module files — all tag assignment
 * lives in this file. Modules emit plain issue `code` strings; the
 * centralized {@link attachIssueTags} post-process attaches `issueTags` to
 * each issue in the aggregator.
 */
export type IssueTag =
  | 'indexability'
  | 'technical-seo'
  | 'content-depth'
  | 'schema'
  | 'internal-linking'
  | 'answerability'
  | 'citations'
  | 'entity-clarity'
  | 'source-trust'
  | 'ai-visibility'
  | 'experience';

/**
 * The canonical, ordered list of all {@link IssueTag} members. Exposed for
 * tests and downstream tooling that needs to enumerate the closed vocabulary
 * (e.g. asserting no out-of-vocabulary tag is ever produced).
 */
export const ISSUE_TAGS: readonly IssueTag[] = [
  'indexability',
  'technical-seo',
  'content-depth',
  'schema',
  'internal-linking',
  'answerability',
  'citations',
  'entity-clarity',
  'source-trust',
  'ai-visibility',
  'experience',
];

/**
 * Complete mapping from every emitted issue `code` to its normalized
 * {@link IssueTag} array.
 *
 * Coverage is exhaustive: every one of the 58 unique codes emitted across the
 * 7 scoring modules (`indexability`, `technical`, `content`, `semantic`,
 * `experience`, `linking`, `ai-visibility`) plus the 3 NeuronWriter
 * enrichment codes from `engine.ts` resolves to a non-empty tag array. A code
 * emitted by more than one module (`ANSWER_BLOCK_OPPORTUNITY` is emitted by
 * both the technical and ai-visibility modules) has exactly ONE entry here, so
 * its tag set is deterministic regardless of which module produced the issue.
 *
 * Tags are ordered by relevance (most relevant first) within each entry. The
 * matcher treats `issueTags` as a set, but the array order is preserved
 * verbatim onto {@link AuditIssue.issueTags} and {@link Recommendation.issueTags}.
 */
export const CODE_TO_TAGS: Readonly<Record<string, IssueTag[]>> = Object.freeze({
  // ── Indexability & Crawlability module ─────────────────────────────────
  HTTP_5XX_DETECTED: ['indexability'],
  HTTP_4XX_DETECTED: ['indexability'],
  HTTP_STATUS_NOT_OK: ['indexability'],
  NOINDEX_DETECTED: ['indexability'],
  NOFOLLOW_DETECTED: ['indexability', 'internal-linking'],
  CANONICAL_MISSING: ['indexability'],
  CANONICAL_DOMAIN_MISMATCH: ['indexability'],
  CANONICAL_NON_SELF_REFERENCING: ['indexability'],
  CSR_RENDER_RISK: ['indexability', 'technical-seo'],
  STATIC_HTML_CONTENT_MISSING: ['indexability', 'technical-seo'],
  MAIN_CONTENT_EMPTY: ['indexability', 'content-depth'],

  // ── Technical SEO module ───────────────────────────────────────────────
  TITLE_MISSING: ['technical-seo'],
  TITLE_TOO_SHORT: ['technical-seo'],
  TITLE_TOO_LONG: ['technical-seo'],
  META_DESCRIPTION_MISSING: ['technical-seo'],
  META_DESCRIPTION_TOO_SHORT: ['technical-seo'],
  META_DESCRIPTION_TOO_LONG: ['technical-seo'],
  H1_MISSING: ['technical-seo'],
  MULTIPLE_H1: ['technical-seo'],
  OPEN_GRAPH_INCOMPLETE: ['technical-seo', 'ai-visibility'],
  TWITTER_CARD_INCOMPLETE: ['technical-seo', 'ai-visibility'],
  JSON_LD_INVALID: ['schema'],
  BREADCRUMB_SCHEMA_MISSING: ['schema'],
  JSON_LD_MISSING_RECOMMENDED_SCHEMA: ['schema'],
  // Emitted by both the technical and ai-visibility modules — single
  // deterministic tag set regardless of origin.
  ANSWER_BLOCK_OPPORTUNITY: ['answerability', 'ai-visibility'],

  // ── Content Depth module ───────────────────────────────────────────────
  LOW_STRUCTURE_QUALITY: ['content-depth'],
  NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC: ['content-depth', 'answerability'],
  THIN_CONTENT_RISK: ['content-depth'],
  INTRO_MISSING_OR_WEAK: ['content-depth'],
  KEYWORD_STUFFING_RISK: ['content-depth'],
  CONTENT_INTENT_MISMATCH_RISK: ['content-depth', 'answerability'],

  // ── Semantic module ────────────────────────────────────────────────────
  TARGET_KEYWORD_NOT_IN_TITLE: ['content-depth', 'technical-seo'],
  TARGET_KEYWORD_NOT_IN_H1: ['content-depth', 'technical-seo'],
  TARGET_KEYWORD_NOT_IN_INTRO: ['content-depth'],
  LOW_SEMANTIC_COVERAGE: ['content-depth', 'entity-clarity'],
  SEMANTIC_GAP_DETECTED: ['content-depth', 'entity-clarity'],
  HEADING_COVERAGE_WEAK: ['content-depth'],
  INFORMATION_GAIN_OPPORTUNITY: ['content-depth'],
  PRIMARY_TOPIC_UNCLEAR: ['entity-clarity'],
  TOPIC_INFERENCE_LOW_CONFIDENCE: ['entity-clarity'],
  TARGET_KEYWORD_NOT_PROVIDED: ['content-depth'],

  // ── Experience module ──────────────────────────────────────────────────
  HTTPS_MISSING: ['experience'],
  HTML_SIZE_LARGE: ['experience', 'technical-seo'],
  DOM_SIZE_LARGE: ['experience', 'technical-seo'],
  PAGESPEED_PROVIDER_FAILED: ['experience'],
  PAGESPEED_SKIPPED: ['experience'],

  // ── Internal Linking module ────────────────────────────────────────────
  NO_INTERNAL_LINKS: ['internal-linking'],
  GENERIC_ANCHOR_TEXT: ['internal-linking'],
  EMPTY_ANCHOR_TEXT: ['internal-linking'],
  EXCESSIVE_EXTERNAL_LINKS: ['internal-linking'],

  // ── AI Visibility module ───────────────────────────────────────────────
  CITATION_READINESS_WEAK: ['citations', 'source-trust'],
  AI_PARSEABILITY_RISK: ['ai-visibility', 'answerability'],
  ENTITY_CLARITY_WEAK: ['entity-clarity'],
  THIRD_PARTY_MENTION_DATA_UNAVAILABLE: ['source-trust', 'ai-visibility'],
  PLATFORM_READINESS_LIMITED: ['ai-visibility'],

  // ── NeuronWriter enrichment surface (engine.ts) ────────────────────────
  SEMANTIC_LSI_GAP: ['content-depth', 'entity-clarity'],
  SEMANTIC_ENTITY_GAP: ['entity-clarity'],
  SEMANTIC_ENRICHMENT_UNAVAILABLE: ['content-depth'],
});

/**
 * Centralized post-process that attaches `issueTags` to every issue in the
 * given array based on the {@link CODE_TO_TAGS} map.
 *
 * This is the **only** place where tag literals are assigned to issues — the
 * 7 scoring module files emit plain issue `code` strings and stay tag-free.
 * Wired into the scoring aggregator in `engine.ts` so every emitted
 * {@link AuditIssue} (and the {@link Recommendation} projected from it)
 * carries `issueTags`.
 *
 * The function mutates each issue in place by setting `issueTags` to a fresh
 * copy of the mapped tag array (so consumers cannot accidentally mutate the
 * shared {@link CODE_TO_TAGS} entries), and returns the same array reference
 * for convenience. Issues whose `code` is present in {@link CODE_TO_TAGS}
 * always receive a non-empty tag array. An unknown code throws to fail fast
 * and surface the missing mapping (the coverage invariant requires every
 * emitted code to be mapped).
 */
export function attachIssueTags(issues: AuditIssue[]): AuditIssue[] {
  for (const issue of issues) {
    const tags = CODE_TO_TAGS[issue.code];
    if (!tags || tags.length === 0) {
      throw new Error(
        `attachIssueTags: issue code "${issue.code}" has no tag mapping in CODE_TO_TAGS. ` +
          'Add a mapping in issue-tags.ts so every emitted code resolves to a non-empty IssueTag[].',
      );
    }
    issue.issueTags = tags.slice();
  }
  return issues;
}
