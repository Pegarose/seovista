/** Keyword rank extraction — pure SERP parsing/matching. No network, no score. */
export interface SerpEntry {
  readonly position: number; // 1-based
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
}

export const SERP_LOCALES = {
  "tr-TR": { searxngLanguage: "tr-TR", label: "Türkçe (Türkiye)" },
  "en-US": { searxngLanguage: "en-US", label: "English (US)" },
} as const;
export type SerpLocale = keyof typeof SERP_LOCALES;

export function normalizeHost(input: string): string {
  let host = input.trim().toLowerCase();
  if (!host.includes("://")) host = `https://${host}`;
  try {
    host = new URL(host).hostname;
  } catch {
    host = input.trim().toLowerCase().split("/")[0] ?? "";
  }
  return host.replace(/^www\./, "");
}

export function matchesDomain(resultUrl: string, targetDomain: string): boolean {
  const host = normalizeHost(resultUrl);
  const target = normalizeHost(targetDomain);
  return host === target || host.endsWith(`.${target}`);
}

export function parseSerpEntries(raw: unknown): SerpEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const entries: SerpEntry[] = [];
  for (const item of results) {
    if (entries.length >= 10) break;
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string" || !url) continue;
    const title = (item as { title?: unknown }).title;
    const content = (item as { content?: unknown }).content;
    entries.push({
      position: entries.length + 1,
      url,
      title: typeof title === "string" ? title : "",
      snippet: typeof content === "string" ? content : "",
    });
  }
  return entries;
}

export interface KeywordRankResult {
  readonly position: number | null;
  readonly top10: ReadonlyArray<SerpEntry & { readonly isTarget: boolean }>;
}

export function extractKeywordRank(input: { domain: string; entries: SerpEntry[] }): KeywordRankResult {
  const top10 = input.entries.map((e) => ({ ...e, isTarget: matchesDomain(e.url, input.domain) }));
  const hit = top10.find((e) => e.isTarget);
  return { position: hit ? hit.position : null, top10 };
}

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const BLOCKED_TLDS = new Set(["local", "internal", "test", "localhost", "invalid"]);

export function isValidPublicDomain(input: string): boolean {
  const host = normalizeHost(input);
  if (!host || host.length > 253 || !host.includes(".")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false; // IP literals
  if (!HOSTNAME_RE.test(host)) return false;
  const tld = host.split(".").pop() ?? "";
  return /^[a-z]{2,}$/.test(tld) && !BLOCKED_TLDS.has(tld);
}
