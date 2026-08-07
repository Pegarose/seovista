/**
 * Guardrail labels used by CrewAgency inside AI-generated strategy reports.
 *
 * The crew marks uncertain or decision-relevant statements with bracketed
 * Turkish-uppercase labels such as `[SİMÜLASYON]` or `[VERİ EKSİK]`. These
 * keys are part of the honesty contract (spec §4): they must never be
 * stripped, only surfaced, and they must keep their Turkish-uppercase form
 * because `transformGuardrailLabels` matches them with
 * `toLocaleUpperCase("tr")`. The VALUES (badge text + description) are the
 * English copy surfaced to users. `transformGuardrailLabels` rewrites the
 * known labels — and only the known ones — into a `**⟦G:ETIKET⟧**` strong
 * marker that the report view's `strong` renderer turns into a text + color
 * badge chip.
 */

export type GuardrailTone = "amber" | "blue" | "red" | "green" | "slate";

export interface GuardrailLabelMeta {
  /** Badge text rendered inside the chip. */
  label: string;
  /** Badge color tone (always paired with the label text — never color-only). */
  tone: GuardrailTone;
  /** One-line explanation exposed via the badge's `title` attribute. */
  description: string;
}

/**
 * The five known guardrail labels, keyed by their Turkish-uppercase bracket
 * form exactly as the crew emits them.
 */
export const GUARDRAIL_LABELS: Record<string, GuardrailLabelMeta> = {
  SİMÜLASYON: {
    label: "Simulation",
    tone: "amber",
    description: "This statement is a simulated scenario, not a real measurement.",
  },
  TAHMİN: {
    label: "Forecast",
    tone: "blue",
    description: "This statement is a forecast that is not based on verified data.",
  },
  "VERİ EKSİK": {
    label: "Missing Data",
    tone: "red",
    description: "Not enough data was found on this topic; information may be incomplete.",
  },
  "KARAR GEREKLİ": {
    label: "Decision Needed",
    tone: "slate",
    description: "Your decision is required to act on this step.",
  },
  HESAPLANAN: {
    label: "Calculated",
    tone: "green",
    description: "This value was calculated from the current audit data.",
  },
};

/** Matches bracketed text like `[SİMÜLASYON]` (no nested brackets). */
const BRACKET_PATTERN = /\[([^\[\]]+)\]/g;

/**
 * Rewrites known guardrail labels in the raw crew markdown to the
 * `**⟦G:ETIKET⟧**` strong marker consumed by the report view.
 *
 * Matching is Turkish-uppercase aware: the bracket content is normalized with
 * `toLocaleUpperCase("tr")` so `[Tahmin]` matches `TAHMİN` (dotted İ).
 * Unknown bracket text (e.g. `[SOMETHING]`, markdown link text) is left
 * untouched.
 */
export function transformGuardrailLabels(markdown: string): string {
  return markdown.replace(BRACKET_PATTERN, (raw, inner: string) => {
    const key = inner.trim().toLocaleUpperCase("tr");
    if (Object.prototype.hasOwnProperty.call(GUARDRAIL_LABELS, key)) {
      return `**⟦G:${key}⟧**`;
    }
    return raw;
  });
}
