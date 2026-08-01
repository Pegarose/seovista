/**
 * Guardrail labels used by CrewAgency inside AI-generated strategy reports.
 *
 * The crew marks uncertain or decision-relevant statements with bracketed
 * Turkish labels such as `[SİMÜLASYON]` or `[VERİ EKSİK]`. These labels are
 * part of the honesty contract (spec §4): they must never be stripped, only
 * surfaced. `transformGuardrailLabels` rewrites the known labels — and only
 * the known ones — into a `**⟦G:ETIKET⟧**` strong marker that the report
 * view's `strong` renderer turns into a text + color badge chip.
 */

export type GuardrailTone = "amber" | "blue" | "red" | "green" | "slate";

export interface GuardrailLabelMeta {
  /** Turkish badge text rendered inside the chip. */
  label: string;
  /** Badge color tone (always paired with the label text — never color-only). */
  tone: GuardrailTone;
  /** One-line Turkish explanation exposed via the badge's `title` attribute. */
  description: string;
}

/**
 * The five known guardrail labels, keyed by their Turkish-uppercase bracket
 * form exactly as the crew emits them.
 */
export const GUARDRAIL_LABELS: Record<string, GuardrailLabelMeta> = {
  SİMÜLASYON: {
    label: "Simülasyon",
    tone: "amber",
    description: "Bu ifade gerçek ölçüm değil, simüle edilmiş bir senaryodur.",
  },
  TAHMİN: {
    label: "Tahmin",
    tone: "blue",
    description: "Bu ifade doğrulanmış veriye dayanmayan bir tahmindir.",
  },
  "VERİ EKSİK": {
    label: "Veri Eksik",
    tone: "red",
    description: "Bu konuda yeterli veri bulunamadı; eksik bilgi olabilir.",
  },
  "KARAR GEREKLİ": {
    label: "Karar Gerekli",
    tone: "slate",
    description: "Bu adımın uygulanması için sizin kararınız gerekiyor.",
  },
  HESAPLANAN: {
    label: "Hesaplanan",
    tone: "green",
    description: "Bu değer mevcut denetim verilerinden hesaplanmıştır.",
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
