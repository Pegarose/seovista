import {
  CanonicalError,
  parseSiteUrl,
  parseTrustedUrl,
  resolveCanonical as resolveSharedCanonical,
  resolveCanonicalFromOverride,
} from "@seovista/seo-core";
import { z } from "zod";
import type { CanonicalInfo, MapFailure } from "./types.js";

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

export interface RedirectInput {
  readonly source: string;
  readonly destination: string;
  readonly permanent: boolean;
  readonly statusCode: number;
}

export interface ValidatedRedirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent: true;
  readonly statusCode: 301;
}

export function validateRedirect(
  trustedSiteUrl: string,
  redirect: RedirectInput,
): { success: true; value: ValidatedRedirect } | { success: false; value: MapFailure } {
  const trusted = parseTrustedSiteUrl(trustedSiteUrl);
  if (!trusted) return canonicalFailure("trustedSiteUrl", parseCanonicalFailure(trustedSiteUrl));
  if (!redirect.permanent || redirect.statusCode !== 301) {
    return canonicalFailure("redirect", "Sprint 0 redirects must be permanent HTTP 301 redirects.");
  }

  const source = resolveRedirectPath(trusted.origin, redirect.source, "redirect.source");
  if (!source.success) return source;
  const destination = resolveRedirectPath(trusted.origin, redirect.destination, "redirect.destination");
  if (!destination.success) return destination;
  if (source.value === destination.value) {
    return canonicalFailure("redirect", "Redirect source and destination must not be identical.");
  }

  return {
    success: true,
    value: { source: source.value, destination: `${trusted.origin}${destination.value}`, permanent: true, statusCode: 301 },
  };
}

/** Validates the complete set so every legacy route resolves in exactly one permanent hop. */
export function validateRedirectSet(
  trustedSiteUrl: string,
  redirects: readonly RedirectInput[],
): { success: true; value: readonly ValidatedRedirect[] } | { success: false; value: MapFailure } {
  const validated: ValidatedRedirect[] = [];
  const sources = new Set<string>();
  for (const redirect of redirects) {
    const result = validateRedirect(trustedSiteUrl, redirect);
    if (!result.success) return result;
    if (sources.has(result.value.source)) return canonicalFailure("redirect.source", "Duplicate redirect source.");
    sources.add(result.value.source);
    validated.push(result.value);
  }

  const sourcePaths = new Set(validated.map((redirect) => redirect.source));
  for (const redirect of validated) {
    const destinationPath = new URL(redirect.destination).pathname;
    if (sourcePaths.has(destinationPath)) {
      return canonicalFailure("redirect.destination", "Redirect chains and loops are not allowed.");
    }
  }
  return { success: true, value: Object.freeze(validated) };
}

function resolveRedirectPath(
  trustedOrigin: string,
  raw: string,
  field: "redirect.source" | "redirect.destination",
): { success: true; value: string } | { success: false; value: MapFailure } {
  let url: URL;
  try {
    url = new URL(raw, trustedOrigin);
  } catch {
    return canonicalFailure(field, "Redirect path must be a valid trusted URL.");
  }
  if (url.origin !== trustedOrigin || url.username || url.password || url.port || url.search || url.hash) {
    return canonicalFailure(field, "Redirect path must be trusted and contain no credentials, port, query, or fragment.");
  }
  try {
    const normalized = resolveSharedCanonical(trustedOrigin, url.pathname);
    if (`${trustedOrigin}${url.pathname}` !== normalized) {
      return canonicalFailure(field, "Redirect path must be lowercase and have a trailing slash.");
    }
    return { success: true, value: url.pathname };
  } catch (error) {
    return canonicalFailure(field, toCanonicalFailure(error).reason);
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
