import { z } from "zod";
import type { MapFailure, CanonicalInfo } from "./types";

const TRUSTED_PATH = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/;
const TRAILING_SLASH_PATH = /\/$/;
const LOWERCASE_PATH = /^[a-z0-9/-]+$/;
const FRAGMENT_OR_QUERY = /[#?]/;
const USERINFO = /\/\/.*@/;

export interface TrustedSiteUrl {
  readonly origin: string;
  readonly hostname: string;
  readonly isHttps: boolean;
}

export function parseTrustedSiteUrl(raw: string): TrustedSiteUrl | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return { origin: url.origin, hostname: url.hostname, isHttps: true };
  } catch {
    return null;
  }
}

export function resolveCanonical(
  trustedSiteUrl: string,
  canonicalPath: string | undefined,
  canonicalOverride: string | undefined,
): { success: true; value: CanonicalInfo } | { success: false; value: MapFailure } {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) {
    return {
      success: false,
      value: {
        success: false,
        field: "trustedSiteUrl",
        reason: "Trusted site URL must be an HTTPS origin with no path, port, query, or fragment.",
        redacted: true,
      },
    };
  }

  if (canonicalOverride) {
    try {
      const overrideUrl = new URL(canonicalOverride);
      if (overrideUrl.origin !== trusted.origin) {
        return {
          success: false,
          value: {
            success: false,
            field: "canonicalOverride",
            reason: "Canonical override must use the trusted site origin.",
            redacted: true,
          },
        };
      }
      if (overrideUrl.username || overrideUrl.password || overrideUrl.port || overrideUrl.search || overrideUrl.hash) {
        return {
          success: false,
          value: {
            success: false,
            field: "canonicalOverride",
            reason: "Canonical override must not contain credentials, ports, query, or fragment.",
            redacted: true,
          },
        };
      }
      const path = overrideUrl.pathname;
      if (!TRUSTED_PATH.test(path) || !TRAILING_SLASH_PATH.test(path) || !LOWERCASE_PATH.test(path)) {
        return {
          success: false,
          value: {
            success: false,
            field: "canonicalOverride",
            reason: "Canonical override path must be lowercase, trailing-slash, and safe.",
            redacted: true,
          },
        };
      }
      return {
        success: true,
        value: {
          path,
          absolute: `${trusted.origin}${path}`,
          override: canonicalOverride,
        },
      };
    } catch {
      return {
        success: false,
        value: {
          success: false,
          field: "canonicalOverride",
          reason: "Canonical override must be a valid HTTPS URL.",
          redacted: true,
        },
      };
    }
  }

  const path = canonicalPath ?? "/";
  if (!TRUSTED_PATH.test(path) || !TRAILING_SLASH_PATH.test(path) || !LOWERCASE_PATH.test(path)) {
    return {
      success: false,
      value: {
        success: false,
        field: "canonicalPath",
        reason: "Canonical path must be lowercase, trailing-slash, and safe.",
        redacted: true,
      },
    };
  }

  return {
    success: true,
    value: {
      path,
      absolute: `${trusted.origin}${path}`,
    },
  };
}

export function validateRedirect(
  trustedSiteUrl: string,
  redirect: { source: string; destination: string; permanent: boolean; statusCode: number },
): { success: true; value: { source: string; destination: string; permanent: boolean; statusCode: 301 | 302 } } | { success: false; value: MapFailure } {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) {
    return {
      success: false,
      value: {
        success: false,
        field: "trustedSiteUrl",
        reason: "Trusted site URL must be an HTTPS origin.",
        redacted: true,
      },
    };
  }

  if (redirect.source === redirect.destination) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect",
        reason: "Redirect source and destination must not be identical.",
        redacted: true,
      },
    };
  }

  let destinationUrl: URL;
  try {
    destinationUrl = new URL(redirect.destination, trusted.origin);
  } catch {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.destination",
        reason: "Redirect destination must be a valid URL.",
        redacted: true,
      },
    };
  }

  if (destinationUrl.origin !== trusted.origin) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.destination",
        reason: "Redirect destination must stay within the trusted site origin.",
        redacted: true,
      },
    };
  }
  if (destinationUrl.username || destinationUrl.password || destinationUrl.port || destinationUrl.search || destinationUrl.hash) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.destination",
        reason: "Redirect destination must not contain credentials, ports, query, or fragment.",
        redacted: true,
      },
    };
  }
  if (FRAGMENT_OR_QUERY.test(redirect.destination) || USERINFO.test(redirect.destination)) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.destination",
        reason: "Redirect destination must not contain query, fragment, or credentials.",
        redacted: true,
      },
    };
  }
  if (!TRAILING_SLASH_PATH.test(destinationUrl.pathname) || !LOWERCASE_PATH.test(destinationUrl.pathname)) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.destination",
        reason: "Redirect destination path must be lowercase and trailing-slash.",
        redacted: true,
      },
    };
  }

  const statusCode = redirect.statusCode === 301 || redirect.statusCode === 302 ? redirect.statusCode : 301;
  if (!redirect.permanent && statusCode === 301) {
    return {
      success: false,
      value: {
        success: false,
        field: "redirect.permanent",
        reason: "Permanent redirect must use status code 301.",
        redacted: true,
      },
    };
  }

  return {
    success: true,
    value: {
      source: redirect.source,
      destination: `${trusted.origin}${destinationUrl.pathname}`,
      permanent: statusCode === 301,
      statusCode,
    },
  };
}

export function isTrustedUrl(trustedSiteUrl: string, candidate: string): boolean {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) return false;
  try {
    const url = new URL(candidate, trusted.origin);
    return url.origin === trusted.origin && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export const siteUrlSchema = z.string().refine((val) => parseTrustedSiteUrl(val) !== null, {
  message: "Site URL must be an HTTPS origin with no path, port, query, or fragment.",
});
