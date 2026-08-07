import type { ScoreBreakdownModule } from "@seovista/geo-engine";

/**
 * Render-friendly English status labels for a scoring module's `status` band.
 *
 * The numeric `score` / `maxScore` is always rendered alongside the label so
 * the band is never communicated by color or label alone — keyboard and
 * screen-reader users see the concrete numbers.
 */
export const MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string> = {
  excellent: "Excellent",
  good: "Good",
  needs_improvement: "Needs improvement",
  poor: "Poor",
  critical: "Critical",
};

/**
 * English issue description dictionary for the geo-engine issue codes.
 *
 * Coverage invariant: every issue `code` the geo-engine can emit (i.e. every
 * key of `CODE_TO_TAGS` in `packages/geo-engine/src/issue-tags.ts`) MUST have
 * an entry here. The companion test `issue-translations.test.ts` enforces this
 * so a future engine code never silently falls back to the raw
 * `AuditIssue.title` in the UI. The keys are the engine contract and stay
 * unchanged; only the rendered descriptions are English.
 */
export const ISSUE_TRANSLATIONS: Record<string, string> = {
  ANSWER_BLOCK_OPPORTUNITY: "Clear question-and-answer or FAQ blocks are missing from the content.",
  CITATION_READINESS_WEAK: "Few citations and links to authoritative external sources.",
  AI_PARSEABILITY_RISK: "No structured list or table formatting was found.",
  ENTITY_CLARITY_WEAK: "Key topic concepts and entity definitions are not stated clearly.",
  THIRD_PARTY_MENTION_DATA_UNAVAILABLE: "Third-party brand mention data is not integrated yet.",
  PLATFORM_READINESS_LIMITED: "Limited readiness to be cited on AI platforms.",
  LOW_STRUCTURE_QUALITY: "Weak content structure (subheadings missing).",
  NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC: "No list or table is used for complex topics.",
  THIN_CONTENT_RISK: "Thin or shallow content detected.",
  INTRO_MISSING_OR_WEAK: "The main topic does not appear in the opening paragraph.",
  KEYWORD_STUFFING_RISK: "Risk of excessive keyword usage.",
  CONTENT_INTENT_MISMATCH_RISK: "Search intent and page type do not match.",
  HTTPS_MISSING: "Secure HTTPS connection is missing.",
  HTML_SIZE_LARGE: "The HTML file size is very large.",
  DOM_SIZE_LARGE: "The number of DOM nodes is high.",
  HTTP_5XX_DETECTED: "Server error (HTTP 5xx) detected.",
  HTTP_4XX_DETECTED: "Page not found or access error (HTTP 4xx).",
  HTTP_STATUS_NOT_OK: "The page returns an unexpected HTTP status code instead of 200 OK.",
  NOINDEX_DETECTED: "The page contains a noindex tag.",
  NOFOLLOW_DETECTED: "The page contains a nofollow tag.",
  CANONICAL_MISSING: "Canonical URL tag is missing.",
  CANONICAL_DOMAIN_MISMATCH: "The canonical tag has a domain mismatch.",
  CANONICAL_NON_SELF_REFERENCING: "The canonical tag does not point to the page itself.",
  CSR_RENDER_RISK: "Content is rendered only on the client side (JS).",
  STATIC_HTML_CONTENT_MISSING: "No text content found in the static HTML.",
  MAIN_CONTENT_EMPTY: "The main content area appears empty.",
  NO_INTERNAL_LINKS: "No internal links found on the page.",
  GENERIC_ANCHOR_TEXT: "Generic or vague anchor texts are used.",
  EMPTY_ANCHOR_TEXT: "Empty links with no text were detected.",
  EXCESSIVE_EXTERNAL_LINKS: "Excessive number of external links.",
  TARGET_KEYWORD_NOT_IN_TITLE: "The target topic is not in the title tag.",
  TARGET_KEYWORD_NOT_IN_H1: "The target topic is not in the H1 heading.",
  TARGET_KEYWORD_NOT_IN_INTRO: "The target topic is not in the first content paragraph.",
  LOW_SEMANTIC_COVERAGE: "Limited semantic coverage of the main topic in the content.",
  SEMANTIC_GAP_DETECTED: "The main topic was not found in the content.",
  HEADING_COVERAGE_WEAK: "Subheadings do not reflect the main topic well enough.",
  INFORMATION_GAIN_OPPORTUNITY: "The content could be enriched with additional subtopics.",
  PRIMARY_TOPIC_UNCLEAR: "The main topic of the page could not be understood.",
  TOPIC_INFERENCE_LOW_CONFIDENCE: "The main topic was inferred with low confidence.",
  TARGET_KEYWORD_NOT_PROVIDED: "No target keyword was provided — the semantic analysis ran on the general topic.",
  TITLE_MISSING: "Page title (title tag) is missing.",
  TITLE_TOO_SHORT: "The page title is too short.",
  TITLE_TOO_LONG: "The page title is too long.",
  META_DESCRIPTION_MISSING: "Meta description is missing.",
  META_DESCRIPTION_TOO_SHORT: "The meta description is too short.",
  META_DESCRIPTION_TOO_LONG: "The meta description is too long.",
  H1_MISSING: "H1 heading is missing.",
  MULTIPLE_H1: "More than one H1 heading is used.",
  OPEN_GRAPH_INCOMPLETE: "Open Graph social media tags are incomplete.",
  TWITTER_CARD_INCOMPLETE: "Twitter Card tags are incomplete.",
  JSON_LD_INVALID: "Invalid JSON-LD structured data.",
  BREADCRUMB_SCHEMA_MISSING: "Breadcrumb structured data is missing.",
  JSON_LD_MISSING_RECOMMENDED_SCHEMA: "Recommended schema structured data is missing.",
  PAGESPEED_PROVIDER_FAILED: "Page speed data could not be retrieved (PageSpeed API error).",
  PAGESPEED_SKIPPED: "Page speed (Core Web Vitals) was not measured in this analysis.",
  SEMANTIC_LSI_GAP: "Semantic (LSI) terms found on competitor pages are missing from the content.",
  SEMANTIC_ENTITY_GAP: "Important entities related to the topic are missing from the content.",
  SEMANTIC_ENRICHMENT_UNAVAILABLE: "Semantic enrichment data could not be retrieved in this analysis; the score is unaffected.",
};
