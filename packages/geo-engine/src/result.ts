import type { GeoReadinessResult } from "./types.js";

export class GeoReadinessValidationError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(`GEO readiness validation failed: ${field} - ${reason}`);
    this.name = "GeoReadinessValidationError";
  }
}

const PROHIBITED_PHRASES: readonly string[] = [
  "AI Visibility",
  "live audit",
  "completed report",
  "connected provider",
  "production success",
];

export function parseGeoReadinessResult(input: unknown): GeoReadinessResult {
  if (typeof input !== "object" || input === null) {
    throw new GeoReadinessValidationError("input", "GeoReadinessResult must be an object.");
  }
  const result = input as Partial<GeoReadinessResult>;

  if (typeof result.methodologyVersion !== "string" || result.methodologyVersion.length === 0) {
    throw new GeoReadinessValidationError("methodologyVersion", "methodologyVersion is required.");
  }
  if (typeof result.auditedAt !== "string" || result.auditedAt.length === 0) {
    throw new GeoReadinessValidationError("auditedAt", "auditedAt is required.");
  }
  if (typeof result.target !== "string" || result.target.length === 0) {
    throw new GeoReadinessValidationError("target", "target is required.");
  }
  if (!result.scores || typeof result.scores !== "object") {
    throw new GeoReadinessValidationError("scores", "scores object is required.");
  }
  if (!Array.isArray(result.checks)) {
    throw new GeoReadinessValidationError("checks", "checks array is required.");
  }
  if (!Array.isArray(result.priorities)) {
    throw new GeoReadinessValidationError("priorities", "priorities array is required.");
  }
  if (!Array.isArray(result.limitations) || result.limitations.length === 0) {
    throw new GeoReadinessValidationError("limitations", "limitations array is required and must not be empty.");
  }

  for (const limitation of result.limitations) {
    if (PROHIBITED_PHRASES.some((phrase) => limitation.description.includes(phrase))) {
      throw new GeoReadinessValidationError(
        "limitations",
        `Limitation description must not claim ${limitation.description}.`,
      );
    }
  }

  return result as GeoReadinessResult;
}
