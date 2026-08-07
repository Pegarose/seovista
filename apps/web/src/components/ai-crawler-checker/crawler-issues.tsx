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
    <div className="space-y-6">
      {conflicts.length > 0 && (
        <div className="bg-mineral/40 p-6 rounded-lg border border-ember/40 space-y-3">
          <h2 className="font-serif text-2xl text-ink flex items-center gap-2">
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{" "}
            Rule conflicts
          </h2>
          <p className="text-sm text-muted-ink">
            Conflicting rules, or rules that create per-bot policy differences,
            were detected in your robots.txt:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-ink font-medium">
            {conflicts.map((conflict, idx) => (
              <li key={idx}>
                {conflict.description}
                {conflict.lines.length > 0 && (
                  <span className="block pl-5 mt-0.5 text-xs font-mono font-normal text-muted-ink">
                    {conflict.lines.join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="bg-card p-6 rounded-lg border border-hairline space-y-3">
          <h2 className="font-serif text-2xl text-ink">Recommendations</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-ink">
            {recommendations.map((recommendation, idx) => (
              <li key={idx}>{recommendation}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
