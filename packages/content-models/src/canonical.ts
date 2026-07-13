import {
  CanonicalError,
  parseSiteUrl,
  parseTrustedUrl,
  resolveCanonical as resolveSharedCanonical,
  resolveCanonicalFromOverride,
} from "@seovista/seo-core";
import { z } from "zod";
import type { CanonicalInfo, MapFailure } from "./types";

export interface TrustedSiteUrl {
  readonly origin: string;
  readonly hostname: string;
  readonly isHttps: boolean;
}

export function parseTrustedSiteUrl(raw: string): TrustedSiteUrl | null {
  try {
    const trusted = parseSiteUrl(raw);
    return { ...trusted, isHttps: true };
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
    return canonicalFailure("trustedSiteUrl", parseCanonicalFailure(trustedSiteUrl));
  }

  try {
    if (canonicalOverride) {
      const absolute = resolveCanonicalFromOverride(trusted.origin, canonicalOverride);
      return {
        success: true,
        value: {
          path: new URL(absolute).pathname,
          absolute,
          override: canonicalOverride,
        },
      };
    }

    const path = canonicalPath ?? "/";
    const absolute = resolveSharedCanonical(trusted.origin, path);
    return {
      success: true,
      value: { path, absolute },
    };
  } catch (error) {
    const failure = toCanonicalFailure(error);
    return canonicalFailure(canonicalOverride ? "canonicalOverride" : "canonicalPath", failure.reason);
  }
}

export function validateRedirect(
  trustedSiteUrl: string,
  redirect: { source: string; destination: string; permanent: boolean; statusCode: number },
): { success: true; value: { source: string; destination: string; permanent: boolean; statusCode: 301 | 302 } } | { success: false; value: MapFailure } {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) {
    return canonicalFailure("trustedSiteUrl", parseCanonicalFailure(trustedSiteUrl));
  }

  if (redirect.source === redirect.destination) {
    return canonicalFailure("redirect", "Redirect source and destination must not be identical.");
  }

  let destinationUrl: URL;
  try {
    destinationUrl = new URL(redirect.destination, trusted.origin);
  } catch {
    return canonicalFailure("redirect.destination", "Redirect destination must be a valid URL.");
  }

  if (destinationUrl.origin !== trusted.origin) {
    return canonicalFailure(
      "redirect.destination",
      "Redirect destination must stay within the trusted site origin.",
    );
  }

  try {
    const destination = resolveSharedCanonical(trusted.origin, destinationUrl.pathname);
    if (destinationUrl.username || destinationUrl.password || destinationUrl.port || destinationUrl.search || destinationUrl.hash) {
      return canonicalFailure(
        "redirect.destination",
        "Redirect destination must not contain credentials, ports, query, or fragment.",
      );
    }

    const statusCode = redirect.statusCode === 301 || redirect.statusCode === 302 ? redirect.statusCode : 301;
    if (!redirect.permanent && statusCode === 301) {
      return canonicalFailure("redirect.permanent", "Permanent redirect must use status code 301.");
    }

    return {
      success: true,
      value: {
        source: redirect.source,
        destination,
        permanent: statusCode === 301,
        statusCode,
      },
    };
  } catch (error) {
    return canonicalFailure("redirect.destination", toCanonicalFailure(error).reason);
  }
}

export function isTrustedUrl(trustedSiteUrl: string, candidate: string): boolean {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) return false;

  try {
    const candidateUrl = new URL(candidate, trusted.origin);
    const parsed = parseTrustedUrl(candidateUrl.toString());
    return parsed.origin === trusted.origin;
  } catch {
    return false;
  }
}

export const siteUrlSchema = z.string().refine((value) => parseTrustedSiteUrl(value) !== null, {
  message: "Site URL must be an HTTPS origin with no path, port, query, or fragment.",
});

function canonicalFailure(field: string, reason: string): { success: false; value: MapFailure } {
  return {
    success: false,
    value: {
      success: false,
      field,
      reason,
      redacted: true,
    },
  };
}

function parseCanonicalFailure(siteUrl: string): string {
  try {
    parseSiteUrl(siteUrl);
    return "Trusted site URL is invalid.";
  } catch (error) {
    return toCanonicalFailure(error).reason;
  }
}

function toCanonicalFailure(error: unknown): CanonicalError {
  if (error instanceof CanonicalError) return error;
  return new CanonicalError("canonical", "Canonical validation failed.");
}
