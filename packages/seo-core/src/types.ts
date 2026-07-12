export type LocaleCode = string;

export type OpenGraphType = "website" | "article" | "profile" | "book" | "video.movie" | "video.episode" | "video.tv_show" | "video.other" | "music.song" | "music.album" | "music.playlist" | "music.radio_station" | "product";

export type TwitterCard = "summary" | "summary_large_image" | "app" | "player";

export interface RobotsValue {
  readonly index: boolean;
  readonly follow: boolean;
  readonly noarchive?: boolean | undefined;
  readonly nosnippet?: boolean | undefined;
  readonly noimageindex?: boolean | undefined;
}

export interface MetadataInput {
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
  readonly canonicalOverride?: string | undefined;
  readonly locale?: LocaleCode | undefined;
  readonly ogType?: OpenGraphType | undefined;
  readonly twitterCard?: TwitterCard | undefined;
  readonly socialImage?: string | undefined;
  readonly publishedAt?: string | undefined;
  readonly modifiedAt?: string | undefined;
  readonly indexable?: boolean | undefined;
  readonly followLinks?: boolean | undefined;
  readonly isQueryState?: boolean | undefined;
}

export interface MetadataResult {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly locale: LocaleCode;
  readonly robots: RobotsValue;
  readonly openGraph: {
    readonly title: string;
    readonly description: string;
    readonly url: string;
    readonly type: OpenGraphType;
    readonly locale: LocaleCode;
    readonly images?: readonly { url: string; width?: number; height?: number; alt?: string }[];
    readonly siteName?: string | undefined;
  };
  readonly twitter: {
    readonly card: TwitterCard;
    readonly title: string;
    readonly description: string;
    readonly images?: readonly string[];
  };
  readonly alternates?: {
    readonly canonical: string;
    readonly languages?: Record<string, string>;
  };
  readonly publishedAt?: string | undefined;
  readonly modifiedAt?: string | undefined;
}

export interface RobotsGroup {
  readonly userAgent: string;
  readonly allow?: readonly string[];
  readonly disallow?: readonly string[];
}

export interface RobotsOptions {
  readonly sitemapUrl: string;
  readonly groups?: readonly RobotsGroup[];
  readonly approvedAiCrawlers?: readonly string[];
  readonly disallowedPrefixes?: readonly string[];
}

export interface SitemapUrl {
  readonly loc: string;
  readonly lastmod?: string | undefined;
  readonly changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never" | undefined;
  readonly priority?: number | undefined;
}

export interface FeedEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly link: string;
  readonly publishedAt: string;
  readonly modifiedAt?: string | undefined;
}

export interface FeedOptions {
  readonly siteUrl: string;
  readonly title: string;
  readonly description: string;
  readonly feedUrl: string;
  readonly entries?: readonly FeedEntry[];
  readonly language?: string | undefined;
}

export interface LlmsOptions {
  readonly siteUrl: string;
  readonly description: string;
  readonly resources: readonly { title: string; url: string }[];
}
