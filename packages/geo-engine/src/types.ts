/**
 * Versioned GEO readiness result and scoring contracts. Sprint 0 defines the
 * types and configuration only; it does not calculate or market AI Visibility.
 */

export type GeoReadinessMethodologyVersion = "0.1.0";

export interface GeoReadinessScores {
  readonly access: number;
  readonly understanding: number;
  readonly evidence: number;
  readonly authorityReadiness: number;
  readonly overall: number;
}

export interface GeoReadinessCheck {
  readonly id: string;
  readonly name: string;
  readonly category: "access" | "understanding" | "evidence" | "authority";
  readonly passed: boolean;
  readonly weight: number;
  readonly score: number;
  readonly evidence: readonly string[];
  readonly recommendation?: string | undefined;
}

export interface GeoReadinessPriority {
  readonly id: string;
  readonly rank: number;
  readonly description: string;
  readonly impact: "high" | "medium" | "low";
}

export interface GeoReadinessLimitation {
  readonly id: string;
  readonly description: string;
  readonly scope: "methodology" | "data" | "model";
}

export interface GeoReadinessResult {
  readonly methodologyVersion: GeoReadinessMethodologyVersion;
  readonly auditedAt: string;
  readonly target: string;
  readonly scores: GeoReadinessScores;
  readonly checks: readonly GeoReadinessCheck[];
  readonly priorities: readonly GeoReadinessPriority[];
  readonly limitations: readonly GeoReadinessLimitation[];
}

export interface PassFailRule {
  readonly checkId: string;
  readonly threshold: number;
  readonly operator: "gte" | "lte" | "eq";
}

export interface ScoringConfiguration {
  readonly version: string;
  readonly weights: {
    readonly access: number;
    readonly understanding: number;
    readonly evidence: number;
    readonly authorityReadiness: number;
  };
  readonly passFailRules: readonly PassFailRule[];
  readonly maxScore: number;
  readonly limitations: readonly GeoReadinessLimitation[];
}
