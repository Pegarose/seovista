/**
 * Confidence band level for a per-platform AI readiness estimate.
 *
 * The band is derived from BOTH the numeric `confidence` (how sure the
 * engine is of the estimate) and the `experimental` flag (whether the
 * estimate is a heuristic that has not been validated against real AI
 * platform traffic). A platform with `experimental: true` is always
 * classified as `low` regardless of its confidence value, because Sprint 0
 * estimates are explicitly experimental and must be labelled as such to
 * avoid over-claiming trust.
 */
export type ConfidenceBandLevel = "low" | "medium" | "high";

export interface ConfidenceBand {
  level: ConfidenceBandLevel;
  /** English, human-readable label, e.g. "Low — experimental". */
  label: string;
  /** Icon glyph (non-color-only signal) for colour-blind users. */
  icon: string;
  /** Tailwind colour classes for the band chip — always paired with `icon`. */
  tone: string;
}

/**
 * Map a per-platform readiness estimate to a confidence band.
 *
 * Rules:
 *  - `experimental === true`  OR `confidence < 0.5`  → `low`  · "Low — experimental"  · ⚠️
 *  - `0.5 ≤ confidence < 0.75` AND not experimental   → `medium` · "Medium — estimated"  · ◐
 *  - `confidence ≥ 0.75`       AND not experimental   → `high`  · "High — reliable" · ✓
 *
 * The returned band is always paired with an icon glyph so the signal is
 * never colour-only (VAL-A-UI-CONF-002 / WCAG). Callers must still render
 * the icon and the text label together — this function does not emit markup.
 */
export function getConfidenceBand(
  confidence: number,
  experimental: boolean,
): ConfidenceBand {
  if (experimental || confidence < 0.5) {
    return {
      level: "low",
      label: "Low — experimental",
      icon: "⚠️",
      tone: "bg-mineral text-ember border-ember/30",
    };
  }
  if (confidence < 0.75) {
    return {
      level: "medium",
      label: "Medium — estimated",
      icon: "◐",
      tone: "bg-mineral text-spectral border-spectral/30",
    };
  }
  return {
    level: "high",
    label: "High — reliable",
    icon: "✓",
    tone: "bg-mineral text-signal border-signal/30",
  };
}
