export interface ParsedSiteUrl {
  readonly origin: string;
  readonly hostname: string;
}

export class CanonicalError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`Canonical error: ${field} - ${reason}`);
    this.name = "CanonicalError";
  }
}

export function parseSiteUrl(siteUrl: string): ParsedSiteUrl {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new CanonicalError("siteUrl", "Site URL must be a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new CanonicalError("siteUrl", "Site URL must use HTTPS.");
  }
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new CanonicalError(
      "siteUrl",
      "Site URL must be an HTTPS origin with no userinfo, port, path, query, or fragment.",
    );
  }
  return { origin: url.origin, hostname: url.hostname };
}

export function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new CanonicalError("path", "Canonical path must start with /.");
  }
  if (!path.endsWith("/")) {
    throw new CanonicalError("path", "Canonical path must end with a trailing slash.");
  }
  const normalized = path.toLowerCase();
  if (/[^a-z0-9/-]/.test(normalized)) {
    throw new CanonicalError("path", "Canonical path contains invalid characters.");
  }
  return normalized;
}

export function parseTrustedUrl(url: string): { origin: string; pathname: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CanonicalError("url", "URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new CanonicalError("url", "URL must use HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw new CanonicalError(
      "url",
      "URL must not contain credentials, ports, query, or fragment.",
    );
  }
  return { origin: parsed.origin, pathname: parsed.pathname };
}

export function resolveCanonical(siteUrl: string, path: string): string {
  const { origin } = parseSiteUrl(siteUrl);
  const safePath = normalizePath(path);
  return `${origin}${safePath}`;
}

export function resolveCanonicalFromOverride(siteUrl: string, overrideUrl: string): string {
  const { origin } = parseSiteUrl(siteUrl);
  let url: URL;
  try {
    url = new URL(overrideUrl);
  } catch {
    throw new CanonicalError("canonicalOverride", "Canonical override must be a valid URL.");
  }
  if (url.origin !== origin) {
    throw new CanonicalError("canonicalOverride", "Canonical override must use the trusted site origin.");
  }
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new CanonicalError(
      "canonicalOverride",
      "Canonical override must not contain credentials, ports, query, or fragment.",
    );
  }
  return resolveCanonical(siteUrl, url.pathname);
}
