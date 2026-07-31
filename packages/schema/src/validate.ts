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

export interface ExtractedProhibitedClaim {
  field: string;
  reason: string;
}

export interface SchemaAuditExtractionResult {
  rawScriptCount: number;
  validNodes: Record<string, unknown>[];
  parseErrors: string[];
  prohibitedClaims: ExtractedProhibitedClaim[];
  score: number;
}

export function extractAndValidateSchemas(
  html: string,
  _siteUrl: string
): SchemaAuditExtractionResult {
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  const validNodes: Record<string, unknown>[] = [];
  const parseErrors: string[] = [];
  const prohibitedClaims: ExtractedProhibitedClaim[] = [];
  let rawScriptCount = 0;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    rawScriptCount++;
    const scriptContent = match[1].trim();
    if (!scriptContent) continue;

    try {
      const parsed = JSON.parse(scriptContent) as Record<string, unknown>;
      validNodes.push(parsed);

      for (const claim of PROHIBITED_CLAIMS) {
        if (claim.field in parsed) {
          prohibitedClaims.push({ field: claim.field, reason: claim.reason });
        }
      }
    } catch (e) {
      parseErrors.push(e instanceof Error ? e.message : "Invalid JSON-LD format");
    }
  }

  let score = 100;
  if (rawScriptCount === 0) score -= 40;
  score -= parseErrors.length * 20;
  score -= prohibitedClaims.length * 30;
  score = Math.max(0, Math.min(100, score));

  return {
    rawScriptCount,
    validNodes,
    parseErrors,
    prohibitedClaims,
    score,
  };
}
