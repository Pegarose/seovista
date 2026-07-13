import { parseTrustedUrl, resolveCanonical, resolveRootUrl } from "./canonical";
import type {
  FeedEntry,
  FeedOptions,
  LlmsOptions,
  RobotsGroup,
  RobotsOptions,
  SitemapUrl,
} from "./types";

export const DEFAULT_DISALLOWED_PREFIXES: readonly string[] = [
  "/api/",
  "/admin/",
  "/account/",
  "/preview/",
  "/private-audit/",
  "/tokenized/",
  "/draft/",
  "/_next/",
];

export const DEFAULT_APPROVED_AI_CRAWLERS: readonly string[] = [
  "ChatGPT-User",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
];

export function buildRobotsTxt(options: RobotsOptions): string {
  const { origin } = parseTrustedUrl(options.sitemapUrl);
  const groups = options.groups ?? defaultRobotsGroups(options);
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`User-agent: ${group.userAgent}`);
    for (const allow of group.allow ?? []) {
      lines.push(`Allow: ${allow}`);
    }
    for (const disallow of group.disallow ?? []) {
      lines.push(`Disallow: ${disallow}`);
    }
    lines.push("");
  }
  lines.push(`Sitemap: ${origin}/sitemap.xml`);
  return lines.join("\n").trimEnd() + "\n";
}

export function defaultRobotsGroups(options: RobotsOptions): readonly RobotsGroup[] {
  const disallowed = options.disallowedPrefixes ?? DEFAULT_DISALLOWED_PREFIXES;
  const aiCrawlers = options.approvedAiCrawlers ?? DEFAULT_APPROVED_AI_CRAWLERS;
  return [
    { userAgent: "*", allow: ["/"], disallow: disallowed },
    ...aiCrawlers.map((userAgent) => ({
      userAgent,
      allow: ["/"],
      disallow: disallowed,
    })),
  ];
}

export function buildSitemapXml(urls: readonly SitemapUrl[]): string {
  const entries = urls
    .map((url) => {
      let inner = `  <loc>${escapeXml(url.loc)}</loc>\n`;
      if (url.lastmod) {
        inner += `  <lastmod>${escapeXml(url.lastmod)}</lastmod>\n`;
      }
      if (url.changefreq) {
        inner += `  <changefreq>${url.changefreq}</changefreq>\n`;
      }
      if (url.priority !== undefined) {
        inner += `  <priority>${url.priority.toFixed(2)}</priority>\n`;
      }
      return `  <url>\n${inner}  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function buildSitemapUrl(siteUrl: string, path: string): SitemapUrl {
  return { loc: resolveCanonical(siteUrl, path) };
}

export function buildFeedXml(options: FeedOptions): string {
  const rootUrl = resolveRootUrl(options.siteUrl);
  const entries = (options.entries ?? [])
    .map(
      (entry) => `
    <entry>
      <id>${escapeXml(entry.id)}</id>
      <title>${escapeXml(entry.title)}</title>
      <link href="${escapeXml(entry.link)}" />
      <summary>${escapeXml(entry.description)}</summary>
      <published>${escapeXml(entry.publishedAt)}</published>
      ${entry.modifiedAt ? `<updated>${escapeXml(entry.modifiedAt)}</updated>` : ""}
    </entry>`
    )
    .join("");

  const updatedAt = options.updatedAt ?? new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>${escapeXml(options.title)}</title>\n  <link href="${escapeXml(options.feedUrl)}" rel="self" />\n  <link href="${escapeXml(rootUrl)}" />\n  <updated>${escapeXml(updatedAt)}</updated>\n  <id>${escapeXml(options.feedUrl)}</id>\n  <subtitle>${escapeXml(options.description)}</subtitle>\n${entries}\n</feed>\n`;
}

export function buildLlmsTxt(options: LlmsOptions): string {
  const rootUrl = resolveRootUrl(options.siteUrl);
  const lines: string[] = [
    "# SeoVista",
    "",
    options.description,
    "",
    "## Resources",
    `- ${rootUrl}`,
  ];
  for (const resource of options.resources) {
    lines.push(`- ${resource.url}${resource.title ? ` ${resource.title}` : ""}`);
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function isIndexableForRobots(robots: { index: boolean }): boolean {
  return robots.index;
}

export function shouldNoIndexForQueryState(
  _path: string,
  searchParams?: Record<string, string> | URLSearchParams
): boolean {
  if (!searchParams) return false;
  const params =
    searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams);
  return params.size > 0;
}

export function defaultToBaseCanonical(siteUrl: string, path: string): string {
  return resolveCanonical(siteUrl, path);
}

export function filterSitemapUrls(urls: readonly SitemapUrl[]): readonly SitemapUrl[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (seen.has(url.loc)) return false;
    seen.add(url.loc);
    return true;
  });
}

export function filterFeedEntries(entries: readonly FeedEntry[]): readonly FeedEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
