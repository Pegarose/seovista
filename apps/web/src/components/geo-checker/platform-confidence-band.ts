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
  /** Turkish, human-readable label, e.g. "Düşük — deneysel". */
  label: string;
  /** Icon glyph (non-color-only signal) for colour-blind users. */
  icon: string;
  /** Tailwind colour classes for the band chip — always paired with `icon`. */
  tone: string;
}

/**
 * Map a per-platform readiness estimate to a confidence band.
 *
 * Rules (Turkish labels per master PRD §0.3 and the web-feature-worker skill):
 *  - `experimental === true`  OR `confidence < 0.5`  → `low`  · "Düşük — deneysel"  · ⚠️
 *  - `0.5 ≤ confidence < 0.75` AND not experimental   → `medium` · "Orta — tahmini"  · ◐
 *  - `confidence ≥ 0.75`       AND not experimental   → `high`  · "Yüksek — güvenilir" · ✓
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
      label: "Düşük — deneysel",
      icon: "⚠️",
      tone: "bg-amber-50 text-amber-800 border-amber-200",
    };
  }
  if (confidence < 0.75) {
    return {
      level: "medium",
      label: "Orta — tahmini",
      icon: "◐",
      tone: "bg-sky-50 text-sky-800 border-sky-200",
    };
  }
  return {
    level: "high",
    label: "Yüksek — güvenilir",
    icon: "✓",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };
}
