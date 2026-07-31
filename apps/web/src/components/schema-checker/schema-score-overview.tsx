import React from "react";
import { getSchemaScoreBand, type SchemaScoreBand } from "../../lib/schema-checker/score-band";

export interface SchemaScoreOverviewProps {
  score: number;
  rawScriptCount: number;
  parseErrorCount: number;
  prohibitedClaimCount: number;
}

const BAND_PRESENTATION: Record<SchemaScoreBand, { statusText: string; statusBg: string }> = {
  excellent: {
    statusText: "Mükemmel",
    statusBg: "bg-green-50 text-green-700 border-green-200",
  },
  good: {
    statusText: "İyi",
    statusBg: "bg-green-50 text-green-700 border-green-200",
  },
  needs_improvement: {
    statusText: "İyileştirilebilir",
    statusBg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  poor: {
    statusText: "Zayıf",
    statusBg: "bg-red-50 text-red-700 border-red-200",
  },
  critical: {
    statusText: "Kritik / Hatalı",
    statusBg: "bg-red-50 text-red-700 border-red-200",
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
  const { statusText, statusBg } = BAND_PRESENTATION[getSchemaScoreBand(score)];

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Yapısal Veri Skoru</h2>
          <p className="text-sm text-slate-500 mt-1">
            Sayfanızdaki Schema.org verilerinin kalite ve uyumluluk özeti.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-4xl font-extrabold text-slate-900" aria-label={`Skor: ${score}`}>
            {score}
          </div>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusBg}`}
            role="status"
          >
            {statusText}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
          <div className="text-2xl font-bold text-slate-900">{rawScriptCount}</div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Tespit Edilen Schema Script
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
          <div
            className={`text-2xl font-bold ${
              parseErrorCount > 0 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {parseErrorCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Ayrıştırma Hatası
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
          <div
            className={`text-2xl font-bold ${
              prohibitedClaimCount > 0 ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {prohibitedClaimCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-medium">
            Yasaklı/Hileli İddia
          </div>
        </div>
      </div>
    </div>
  );
}
