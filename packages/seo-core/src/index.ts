export const name: string = "@seovista/seo-core";

export type {
  LocaleCode,
  OpenGraphType,
  TwitterCard,
  RobotsValue,
  MetadataInput,
  MetadataResult,
  RobotsGroup,
  RobotsOptions,
  SitemapUrl,
  FeedEntry,
  FeedOptions,
  LlmsOptions,
} from "./types.js";

export {
  buildMetadata,
  buildNoIndexMetadata,
  MetadataValidationError,
} from "./metadata.js";

export {
  parseSiteUrl,
  parseTrustedUrl,
  normalizePath,
  resolveCanonical,
  resolveRootUrl,
  resolveCanonicalFromOverride,
  CanonicalError,
} from "./canonical.js";

export type { ParsedSiteUrl } from "./canonical.js";

export {
  buildRobotsTxt,
  buildSitemapXml,
  buildSitemapUrl,
  buildFeedXml,
  buildLlmsTxt,
  isIndexableForRobots,
  shouldNoIndexForQueryState,
  defaultToBaseCanonical,
  filterSitemapUrls,
  filterFeedEntries,
  DEFAULT_DISALLOWED_PREFIXES,
  DEFAULT_APPROVED_AI_CRAWLERS,
} from "./policies.js";

export {
  generateReportSignature,
  verifyReportSignature,
} from "./security/report-signer.js";

export type {
  RobotsRule,
  RobotsGroup as RobotsTxtGroup,
  RobotsTxtDocument,
  CrawlerAccessStatus,
  RuleConflict,
} from "./robots.js";

export {
  parseRobotsTxt,
  robotsPatternMatches,
  isPathAllowed,
  evaluateCrawlerAccess,
  detectRuleConflicts,
  detectContradictoryRuleConflicts,
} from "./robots.js";

export type {
  CrawlerCategory,
  CrawlerDescriptor,
  CrawlerEvaluation,
} from "./ai-crawlers.js";

export {
  AI_CRAWLER_REGISTRY,
  evaluateAllCrawlers,
} from "./ai-crawlers.js";

export type {
  SerpTruncation,
  SerpGuidance,
  SerpVariantMetrics,
  SerpAnalysis,
} from "./serp-preview.js";

export {
  measurePixelWidth,
  truncateAtPixelWidth,
  analyzeSerpSnippet,
  SERP_LIMITS,
  SERP_CHAR_GUIDANCE,
} from "./serp-preview.js";

export type {
  SerpEntry,
  SerpLocale,
  KeywordRankResult,
} from "./serp-rank.js";

export {
  SERP_LOCALES,
  normalizeHost,
  matchesDomain,
  parseSerpEntries,
  extractKeywordRank,
  isValidPublicDomain,
} from "./serp-rank.js";
