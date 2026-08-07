import type { ReactElement } from "react";
import type { ScoreBreakdownPlatformReadiness } from "@seovista/geo-engine";
import { getConfidenceBand } from "./platform-confidence-band";

export { getConfidenceBand } from "./platform-confidence-band";
export type { ConfidenceBand, ConfidenceBandLevel } from "./platform-confidence-band";

interface PlatformConfidenceViewProps {
  platforms: ScoreBreakdownPlatformReadiness[];
}

/**
 * Per-platform AI readiness renderer (RSC, `VAL-A-UI-CONF-001` /
 * `VAL-A-UI-CONF-002`).
 *
 * Renders one row per AI platform (ChatGPT, Perplexity, Google AI Overviews,
 * Bing Copilot) inside a semantic `<dl>`. Each row shows the platform name
 * and a confidence-band label as the DEFAULT text (e.g.
 * "Düşük — deneysel"), prefixed with a non-colour-only icon (⚠️ / ◐ / ✓) so
 * colour-blind users can distinguish bands without relying on hue. The
 * numeric readiness `score` (0–100), `confidence`, and `rationale` are
 * preserved inside a `<details>` element so debug paths still see the
 * underlying values; the `<summary>` carries an `aria-label` exposing the
 * numeric score to assistive tech without expanding the panel.
 *
 * This is a pure Server Component — no client-side JS is required.
 */
export function PlatformConfidenceView({
  platforms,
}: PlatformConfidenceViewProps): ReactElement | null {
  if (platforms.length === 0) return null;

  return (
    <section
      aria-labelledby="platform-confidence-heading"
      className="bg-paper p-6 rounded-xl border border-hairline w-full max-w-4xl mx-auto"
    >
      <h2
        id="platform-confidence-heading"
        className="text-xl font-semibold text-ink font-serif mb-1"
      >
        Platform Bazında AI Hazırlık
      </h2>
      <p className="text-sm text-muted-ink mb-4">
        Her platformun hazır olduğu güven bandı ile gösterilir. Sayısal skor
        ayrıntılarda bulunur.
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {platforms.map((p) => {
          const band = getConfidenceBand(p.confidence, p.experimental);
          return (
            <div
              key={p.platform}
              className="rounded-lg border border-hairline bg-mineral p-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="font-medium text-ink">{p.platform}</dt>
                <dd
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${band.tone}`}
                  aria-label={`${p.platform} güven bandı: ${band.label}`}
                >
                  <span aria-hidden="true">{band.icon}</span>
                  <span>{band.label}</span>
                </dd>
              </div>

              <dd className="text-sm text-muted-ink">
                <details>
                  <summary
                    className="cursor-pointer text-muted-ink hover:text-ink"
                    aria-label={`${p.platform} hazır olma skoru: ${p.score} / 100. Güven: ${Math.round(p.confidence * 100)}%. Ayrıntıları görüntülemek için genişletin.`}
                  >
                    Sayısal skor:{" "}
                    <span className="font-semibold tabular-nums">
                      {p.score}/100
                    </span>{" "}
                    · Güven:{" "}
                    <span className="font-semibold tabular-nums">
                      {Math.round(p.confidence * 100)}%
                    </span>
                  </summary>
                  {p.rationale ? (
                    <p className="mt-2 text-xs text-muted-ink leading-relaxed">
                      {p.rationale}
                    </p>
                  ) : null}
                  {p.experimental ? (
                    <p className="mt-2 text-xs text-ember">
                      Bu tahmin deneyseldir ve gerçek AI platform trafiği
                      ile doğrulanmamıştır.
                    </p>
                  ) : null}
                </details>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
