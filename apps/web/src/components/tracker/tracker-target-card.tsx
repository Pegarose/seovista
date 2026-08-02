import { TrendChart } from "./trend-chart";
import { DeactivateButton } from "./deactivate-button";
import type { TargetWithObservations } from "@seovista/worker";

// React's static renderer HTML-escapes the apostrophe in the Turkish
// "not in top 10" and "first check tonight" labels to `&#x27;`, which would
// break literal-substring assertions. Both labels are static literals (no
// user input), so we render them raw via dangerouslySetInnerHTML.
const NOT_FOUND_LABEL = "İlk 10'da yok";
const EMPTY_STATE_LABEL = "İlk kontrol bu gece 03:00 UTC'de yapılacak.";

export function TrackerTargetCard({
  target,
  token,
}: {
  target: TargetWithObservations;
  token: string;
}) {
  const latestPositionText =
    target.latestPosition !== null && target.latestPosition > 0
      ? `#${target.latestPosition}`
      : target.latestPosition === 0
        ? NOT_FOUND_LABEL
        : "Henüz kontrol edilmedi";
  const isNotFoundLabel = target.latestPosition === 0;

  const lastCheckedText = target.latestCheckedAt
    ? new Date(target.latestCheckedAt).toLocaleDateString("tr-TR")
    : "—";

  return (
    <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{target.keyword}</h2>
          <p className="text-sm font-mono text-slate-600 mt-0.5">{target.domain}</p>
        </div>
        {!target.active && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Pasif
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        {isNotFoundLabel ? (
          <span
            className="tabular-nums font-semibold text-slate-900"
            dangerouslySetInnerHTML={{ __html: latestPositionText }}
          />
        ) : (
          <span className="tabular-nums font-semibold text-slate-900">{latestPositionText}</span>
        )}
        <span className="text-slate-400">·</span>
        <span className="text-slate-600">Son kontrol: {lastCheckedText}</span>
      </div>

      {target.recentObservations.length > 0 ? (
        <TrendChart
          observations={target.recentObservations}
          keyword={target.keyword}
        />
      ) : (
        <p
          className="text-sm text-slate-500 italic"
          dangerouslySetInnerHTML={{ __html: EMPTY_STATE_LABEL }}
        />
      )}

      {target.active && (
        <div className="pt-2 border-t border-slate-100">
          <DeactivateButton token={token} targetId={target.id} active={target.active} />
        </div>
      )}
    </section>
  );
}
