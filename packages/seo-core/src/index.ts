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
} from "./types";

export {
  buildMetadata,
  buildNoIndexMetadata,
} from "./metadata";

export {
  parseSiteUrl,
  parseTrustedUrl,
  normalizePath,
  resolveCanonical,
  resolveCanonicalFromOverride,
  CanonicalError,
} from "./canonical";

export type { ParsedSiteUrl } from "./canonical";

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
} from "./policies";
