import type { ReactElement } from "react";
import type { ScoreBreakdown } from "@seovista/geo-engine";
import { PlatformConfidenceView } from "./platform-confidence";
import { ISSUE_TRANSLATIONS, MODULE_STATUS_LABEL } from "./issue-translations";

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
      className="inline-flex items-center gap-1 rounded-full bg-mineral px-2 py-0.5 text-xs font-semibold text-muted-ink border border-hairline"
      aria-label={`Point loss: ${pointLoss} points`}
    >
      <span aria-hidden="true">▼</span>
      <span>{formatted} pts</span>
    </span>
  );
}

type ParsedScoreBreakdown = Omit<ScoreBreakdown, "platformReadiness"> & {
  platformReadiness?: ScoreBreakdown["platformReadiness"];
};

interface ScoreBreakdownProps {
  breakdown: ParsedScoreBreakdown;
}

/**
 * Per-module score breakdown renderer (RSC, `VAL-A-UI-001` / `VAL-A-UI-002` /
 * `VAL-A-UI-003`).
 *
 * Renders one row per scoring module in a semantic `<table>` (keyboard-
 * navigable, each cell reachable via Tab) with `module.name`, `module.score`,
 * and `module.maxScore` visible as `score/maxScore`. Below the table, each
 * module's issues are listed with their `code`, `message`, and an inline
 * `pointLoss` badge (e.g. `−2 pts`). The `score_version` formula identity is
 * rendered in a footer metadata strip so users and ops can compare across
 * refactors. No client-side JS is required — this is a pure Server Component.
 *
 * Accessibility:
 *  - `<table>` with `<th scope="col">` headers provides native keyboard
 *    navigation and screen-reader semantics.
 *  - Status is rendered as a text label (English) alongside the numeric
 *    score — never color-only.
 *  - The point-loss badge uses an icon (▼) + text + aria-label.
 */
export function ScoreBreakdownView({ breakdown }: ScoreBreakdownProps): ReactElement {
  return (
    <>
    <section
      aria-labelledby="score-breakdown-heading"
      className="bg-paper p-6 rounded-xl border border-hairline w-full max-w-4xl mx-auto"
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h2
          id="score-breakdown-heading"
          className="text-xl font-semibold text-ink font-serif"
        >
          Module score breakdown
        </h2>
        <p className="text-sm text-muted-ink">
          Overall score:{" "}
          <span className="font-semibold text-ink">
            {breakdown.overallScore}/100
          </span>{" "}
          · Status:{" "}
          <span className="font-semibold text-ink">
            {MODULE_STATUS_LABEL[breakdown.band]}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">
            Name, score, maximum score, and status label of each GEO readiness
            module. Navigable row by row with the keyboard.
          </caption>
          <thead className="bg-mineral text-muted-ink">
            <tr>
              <th scope="col" className="text-left font-medium px-4 py-2 border-b border-hairline">
                Module
              </th>
              <th scope="col" className="text-right font-medium px-4 py-2 border-b border-hairline">
                Score
              </th>
              <th scope="col" className="text-left font-medium px-4 py-2 border-b border-hairline">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.modules.map((mod) => (
              <tr key={mod.key} className="border-b border-hairline last:border-b-0">
                <th scope="row" className="text-left font-medium text-ink px-4 py-3 align-top">
                  {mod.name}
                </th>
                <td className="text-right font-semibold text-ink px-4 py-3 align-top tabular-nums whitespace-nowrap">
                  <span aria-label={`${mod.name} module score: ${mod.score} / ${mod.maxScore}`}>
                    {mod.score}/{mod.maxScore}
                  </span>
                </td>
                <td className="text-left text-muted-ink px-4 py-3 align-top">
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
              className="text-base font-semibold text-ink mb-3"
            >
              {mod.name} — issues found
            </h3>
            <ul className="space-y-3">
              {mod.issues.map((issue) => (
                <li
                  key={`${mod.key}-${issue.code}`}
                  className="rounded-lg border border-hairline bg-mineral p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        <code className="font-mono text-xs bg-mineral text-muted-ink px-1.5 py-0.5 rounded">
                          {issue.code}
                        </code>
                      </p>
                      <p className="text-muted-ink mt-1">
                        {ISSUE_TRANSLATIONS[issue.code] || issue.message}
                      </p>
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
        className="mt-6 pt-4 border-t border-hairline text-xs text-muted-ink flex flex-wrap items-center justify-between gap-2"
        aria-label="Score version"
      >
        <span>
          Score version:{" "}
          <span className="font-mono font-semibold text-muted-ink">
            {breakdown.scoreVersion}
          </span>
        </span>
        <span className="sr-only">
          This score version identifies the calculation formula and is used
          to compare runs across refactors.
        </span>
      </footer>
    </section>

    {breakdown.platformReadiness && breakdown.platformReadiness.length > 0 ? (
      <PlatformConfidenceView platforms={breakdown.platformReadiness} />
    ) : null}
    </>
  );
}
