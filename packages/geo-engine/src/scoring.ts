import type { ScoringConfiguration, GeoReadinessLimitation } from "./types.js";

export const defaultLimitations: readonly GeoReadinessLimitation[] = [
  {
    id: "limitation-no-live-model",
    description: "Sprint 0 uses no live AI model queries and calculates no share-of-model metrics.",
    scope: "methodology",
  },
  {
    id: "limitation-no-real-crawl",
    description: "Sprint 0 performs no real HTTP crawls; audit results are contract-only.",
    scope: "data",
  },
];

export const defaultScoringConfiguration: ScoringConfiguration = {
  version: "0.1.0",
  weights: {
    access: 0.25,
    understanding: 0.25,
    evidence: 0.25,
    authorityReadiness: 0.25,
  },
  passFailRules: [
    { checkId: "crawlable", threshold: 1, operator: "eq" },
    { checkId: "canonical_present", threshold: 1, operator: "eq" },
    { checkId: "schema_understandable", threshold: 0.5, operator: "gte" },
    { checkId: "cited_sources", threshold: 0.5, operator: "gte" },
  ],
  maxScore: 1,
  limitations: defaultLimitations,
};

export function getScoringConfiguration(): ScoringConfiguration {
  return defaultScoringConfiguration;
}
