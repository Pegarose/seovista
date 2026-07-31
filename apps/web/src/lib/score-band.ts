/**
 * Single source of truth for the audit tool score bands (Schema Checker,
 * AI Crawler Checker, ...). The result page maps the band to the Crew CTA
 * variant and the score overview component maps it to the Turkish status
 * label/color — both must agree, so the thresholds live here exactly once.
 */
export type SchemaScoreBand = "critical" | "poor" | "needs_improvement" | "good" | "excellent";

export function getSchemaScoreBand(score: number): SchemaScoreBand {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 60) return "needs_improvement";
  if (score >= 40) return "poor";
  return "critical";
}
