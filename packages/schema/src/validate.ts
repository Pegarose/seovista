import type { ProhibitedClaimCheck } from "./types.js";

export const PROHIBITED_CLAIMS: readonly ProhibitedClaimCheck[] = [
  { field: "aggregateRating", reason: "AggregateRating must not be fabricated." },
  { field: "review", reason: "Reviews must not be fabricated." },
  { field: "reviews", reason: "Reviews must not be fabricated." },
  { field: "dataset", reason: "Datasets must not be fabricated." },
  { field: "datasets", reason: "Datasets must not be fabricated." },
  { field: "customerCount", reason: "Customer counts must not be fabricated." },
  { field: "customers", reason: "Customer counts must not be fabricated." },
  { field: "award", reason: "Awards must not be fabricated." },
  { field: "awards", reason: "Awards must not be fabricated." },
  { field: "ratingValue", reason: "Rating values must not be fabricated." },
  { field: "reviewCount", reason: "Review counts must not be fabricated." },
  { field: "guarantee", reason: "Guarantees must not be fabricated." },
  { field: "guarantees", reason: "Guarantees must not be fabricated." },
  { field: "hiddenFaq", reason: "Hidden FAQs must not be included." },
  { field: "hiddenFAQ", reason: "Hidden FAQs must not be included." },
];

export class SchemaValidationError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(`Schema validation failed: ${field} - ${reason}`);
    this.name = "SchemaValidationError";
  }
}

export function rejectProhibitedClaims(input: Record<string, unknown>): void {
  for (const claim of PROHIBITED_CLAIMS) {
    if (claim.field in input) {
      throw new SchemaValidationError(claim.field, claim.reason);
    }
  }
}

export function validateSiteUrl(siteUrl: string): {
  origin: string;
  hostname: string;
} {
  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new SchemaValidationError("siteUrl", "Site URL must be a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new SchemaValidationError("siteUrl", "Site URL must use HTTPS.");
  }
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new SchemaValidationError(
      "siteUrl",
      "Site URL must be an origin with no userinfo, port, path, query, or fragment.",
    );
  }
  return { origin: url.origin, hostname: url.hostname };
}

export function validatePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new SchemaValidationError("path", "Canonical path must start with /.");
  }
  if (!path.endsWith("/")) {
    throw new SchemaValidationError("path", "Canonical path must end with a trailing slash.");
  }
  if (path !== path.toLowerCase()) {
    throw new SchemaValidationError("path", "Canonical path must be lowercase.");
  }
  if (/[^a-z0-9/-]/.test(path)) {
    throw new SchemaValidationError("path", "Canonical path contains invalid characters.");
  }
  return path;
}

export function buildAbsoluteUrl(siteUrl: string, path: string): string {
  const { origin } = validateSiteUrl(siteUrl);
  const safePath = validatePath(path);
  return `${origin}${safePath}`;
}

export function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SchemaValidationError(field, `${field} must be a non-empty string.`);
  }
  return value;
}
