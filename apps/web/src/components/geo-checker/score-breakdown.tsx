import type { ReactElement } from "react";
import type { ScoreBreakdown, ScoreBreakdownModule } from "@seovista/geo-engine";
import { PlatformConfidenceView } from "./platform-confidence";

/**
 * Render-friendly Turkish status labels for a scoring module's `status` band.
 *
 * The numeric `score` / `maxScore` is always rendered alongside the label so
 * the band is never communicated by color or label alone — keyboard and
 * screen-reader users see the concrete numbers. Labels mirror the
 * confidence-labeling convention (Turkish-default per master PRD §0.3).
 */
const MODULE_STATUS_LABEL: Record<ScoreBreakdownModule["status"], string> = {
  excellent: "Mükemmel",
  good: "İyi",
  needs_improvement: "Geliştirilmeli",
  poor: "Zayıf",
  critical: "Kritik",
};

/**
 * Severity glyph used for the per-issue point-loss badge. Deliberately a
 * text + icon pattern (not color-only) so colour-blind users can distinguish
 * a deducting issue from an info-only nudge. The badge is only rendered when
 * `pointLoss < 0` — info-only issues (pointLoss 0) show no badge to avoid
 * visual noise like "−0 puan".
 */
function PointLossBadge({ pointLoss }: { pointLoss: number }): ReactElement | null {
  if (!pointLoss || pointLoss >= 0) return null;
  // Use the unicode minus (−) for the user-facing badge so it reads cleanly,
  // and expose the precise numeric value via aria-label for assistive tech.
  const formatted = `${pointLoss}`.replace("-", "−");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200"
      aria-label={`Puan kaybı: ${pointLoss} puan`}
    >
      <span aria-hidden="true">▼</span>
      <span>{formatted} puan</span>
    </span>
  );
}

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdown;
}

/**
 * Per-module score breakdown renderer (RSC, `VAL-A-UI-001` / `VAL-A-UI-002` /
 * `VAL-A-UI-003`).
 *
 * Renders one row per scoring module in a semantic `<table>` (keyboard-
 * navigable, each cell reachable via Tab) with `module.name`, `module.score`,
 * and `module.maxScore` visible as `score/maxScore`. Below the table, each
 * module's issues are listed with their `code`, `message`, and an inline
 * `pointLoss` badge (e.g. `−2 puan`). The `score_version` formula identity is
 * rendered in a footer metadata strip so users and ops can compare across
 * refactors. No client-side JS is required — this is a pure Server Component.
 *
 * Accessibility:
 *  - `<table>` with `<th scope="col">` headers provides native keyboard
 *    navigation and screen-reader semantics.
 *  - Status is rendered as a text label (Turkish) alongside the numeric
 *    score — never color-only.
 *  - The point-loss badge uses an icon (▼) + text + aria-label.
 */
export function ScoreBreakdownView({ breakdown }: ScoreBreakdownProps): ReactElement {
  return (
    <>
    <section
      aria-labelledby="score-breakdown-heading"
      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full max-w-4xl mx-auto"
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h2
          id="score-breakdown-heading"
          className="text-xl font-semibold text-slate-900 font-display"
        >
          Modül Skor Dağılımı
        </h2>
        <p className="text-sm text-slate-500">
          Genel skor:{" "}
          <span className="font-semibold text-slate-900">
            {breakdown.overallScore}/100
          </span>{" "}
          · Durum:{" "}
          <span className="font-semibold text-slate-900">
            {MODULE_STATUS_LABEL[breakdown.band]}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">
            Her bir GEO hazırlık modülünün adı, kazandığı puan, azami puan ve
            durum etiketi. Klavye ile satır satır gezilebilir.
          </caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="text-left font-medium px-4 py-2 border-b border-slate-200">
                Modül
              </th>
              <th scope="col" className="text-right font-medium px-4 py-2 border-b border-slate-200">
                Skor
              </th>
              <th scope="col" className="text-left font-medium px-4 py-2 border-b border-slate-200">
                Durum
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.modules.map((mod) => (
              <tr key={mod.key} className="border-b border-slate-100 last:border-b-0">
                <th scope="row" className="text-left font-medium text-slate-900 px-4 py-3 align-top">
                  {mod.name}
                </th>
                <td className="text-right font-semibold text-slate-900 px-4 py-3 align-top tabular-nums whitespace-nowrap">
                  <span aria-label={`${mod.name} modülü skoru: ${mod.score} / ${mod.maxScore}`}>
                    {mod.score}/{mod.maxScore}
                  </span>
                </td>
                <td className="text-left text-slate-700 px-4 py-3 align-top">
                  {MODULE_STATUS_LABEL[mod.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {breakdown.modules.map((mod) =>
        mod.issues.length === 0 ? null : (
          <section
            key={`${mod.key}-issues`}
            aria-labelledby={`issues-${mod.key}-heading`}
            className="mt-6"
          >
            <h3
              id={`issues-${mod.key}-heading`}
              className="text-base font-semibold text-slate-900 mb-3"
            >
              {mod.name} — tespit edilen sorunlar
            </h3>
            <ul className="space-y-3">
              {mod.issues.map((issue) => (
                <li
                  key={`${mod.key}-${issue.code}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        <code className="font-mono text-xs bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                          {issue.code}
                        </code>
                      </p>
                      <p className="text-slate-700 mt-1">{issue.message}</p>
                    </div>
                    <PointLossBadge pointLoss={issue.pointLoss} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      <footer
        className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2"
        aria-label="Skor sürümü"
      >
        <span>
          Skor sürümü:{" "}
          <span className="font-mono font-semibold text-slate-700">
            {breakdown.scoreVersion}
          </span>
        </span>
        <span className="sr-only">
          Bu skor sürümü, hesaplama formülünün kimliğidir ve refactor'ler
          arasında karşılaştırma için kullanılır.
        </span>
      </footer>
    </section>

    {breakdown.platformReadiness.length > 0 ? (
      <PlatformConfidenceView platforms={breakdown.platformReadiness} />
    ) : null}
    </>
  );
}
