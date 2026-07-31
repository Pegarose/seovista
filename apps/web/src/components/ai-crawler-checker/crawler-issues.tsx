import React from "react";

export interface CrawlerRuleConflict {
  readonly description: string;
  readonly lines: readonly string[];
}

export interface CrawlerIssuesProps {
  readonly conflicts: readonly CrawlerRuleConflict[];
  readonly recommendations: readonly string[];
}

/**
 * Conflicting robots.txt rules (warning callout) plus the ordered,
 * prioritized recommendation list produced by the audit worker.
 */
export function CrawlerIssues({ conflicts, recommendations }: CrawlerIssuesProps) {
  if (conflicts.length === 0 && recommendations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {conflicts.length > 0 && (
        <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
            <span role="img" aria-label="Uyarı">
              ⚠️
            </span>{" "}
            Kural Çakışmaları
          </h2>
          <p className="text-sm text-amber-700">
            robots.txt dosyanızda birbiriyle çelişen veya bot bazlı politika farkları
            oluşturan kurallar tespit edildi:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-amber-800 font-medium">
            {conflicts.map((conflict, idx) => (
              <li key={idx}>
                {conflict.description}
                {conflict.lines.length > 0 && (
                  <span className="block pl-5 mt-0.5 text-xs font-mono font-normal text-amber-700">
                    {conflict.lines.join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Öneriler</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
            {recommendations.map((recommendation, idx) => (
              <li key={idx}>{recommendation}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
