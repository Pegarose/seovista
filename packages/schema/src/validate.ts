import {
  CanonicalError,
  normalizePath,
  parseSiteUrl,
  resolveCanonical,
} from "@seovista/seo-core";
import type { ProhibitedClaimCheck } from "./types";

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
  try {
    return parseSiteUrl(siteUrl);
  } catch (error) {
    throw translateCanonicalError(error);
  }
}

export function validatePath(path: string): string {
  try {
    return normalizePath(path);
  } catch (error) {
    throw translateCanonicalError(error);
  }
}

export function buildAbsoluteUrl(siteUrl: string, path: string): string {
  try {
    return resolveCanonical(siteUrl, path);
  } catch (error) {
    throw translateCanonicalError(error);
  }
}

export function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SchemaValidationError(field, `${field} must be a non-empty string.`);
  }
  return value;
}

function translateCanonicalError(error: unknown): SchemaValidationError {
  if (error instanceof CanonicalError) {
    return new SchemaValidationError(error.field, error.reason);
  }
  return new SchemaValidationError("canonical", "Canonical validation failed.");
}
