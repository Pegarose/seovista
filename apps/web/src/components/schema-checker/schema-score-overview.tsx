import React from "react";
import { getSchemaScoreBand, type SchemaScoreBand } from "../../lib/score-band";

export interface SchemaScoreOverviewProps {
  score: number;
  rawScriptCount: number;
  parseErrorCount: number;
  prohibitedClaimCount: number;
}

const BAND_PRESENTATION: Record<SchemaScoreBand, { statusText: string; statusClass: string }> = {
  excellent: {
    statusText: "Excellent",
    statusClass: "text-signal border-signal/40",
  },
  good: {
    statusText: "Good",
    statusClass: "text-signal border-signal/40",
  },
  needs_improvement: {
    statusText: "Needs improvement",
    statusClass: "text-ember border-ember/40",
  },
  poor: {
    statusText: "Poor",
    statusClass: "text-ember border-ember/40 bg-mineral/60",
  },
  critical: {
    statusText: "Critical / Faulty",
    statusClass: "text-ember border-ember/40 bg-mineral/60",
  },
};

export function SchemaScoreOverview({
  score,
  rawScriptCount,
  parseErrorCount,
  prohibitedClaimCount,
}: SchemaScoreOverviewProps) {
  // Thresholds come from the shared score-band helper so this component and
  // the result page's Crew CTA band can never drift apart.
  const { statusText, statusClass } = BAND_PRESENTATION[getSchemaScoreBand(score)];

  return (
    <div className="bg-card p-6 rounded-xl border border-hairline space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-hairline">
        <div>
          <h2 className="text-xl font-bold text-ink">Structured data score</h2>
          <p className="text-sm text-muted-ink mt-1">
            Sayfanızdaki Schema.org verilerinin kalite ve uyumluluk özeti.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-4xl font-extrabold text-ink" aria-label={`Skor: ${score}`}>
            {score}
          </div>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusClass}`}
            role="status"
          >
            {statusText}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-paper p-4 rounded-lg border border-hairline text-center">
          <div className="text-2xl font-bold text-ink">{rawScriptCount}</div>
          <div className="text-xs text-muted-ink mt-1 font-medium">
            Tespit Edilen Schema Script
          </div>
        </div>

        <div className="bg-paper p-4 rounded-lg border border-hairline text-center">
          <div
            className={`text-2xl font-bold ${
              parseErrorCount > 0 ? "text-ember" : "text-ink"
            }`}
          >
            {parseErrorCount}
          </div>
          <div className="text-xs text-muted-ink mt-1 font-medium">
            Ayrıştırma Hatası
          </div>
        </div>

        <div className="bg-paper p-4 rounded-lg border border-hairline text-center">
          <div
            className={`text-2xl font-bold ${
              prohibitedClaimCount > 0 ? "text-ember" : "text-ink"
            }`}
          >
            {prohibitedClaimCount}
          </div>
          <div className="text-xs text-muted-ink mt-1 font-medium">
            Yasaklı/Hileli İddia
          </div>
        </div>
      </div>
    </div>
  );
}
