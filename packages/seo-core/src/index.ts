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
