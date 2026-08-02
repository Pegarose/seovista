interface TrendChartProps {
  observations: Array<{ position: number; checkedAt: string }>;
  keyword: string;
}

const VIEW_W = 560;
const VIEW_H = 160;
const PAD_LEFT = 32;
const PAD_RIGHT = 24;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const ZERO_BAND_Y = PAD_TOP + CHART_H + 12;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

// React's static renderer HTML-escapes the apostrophe in the Turkish
// "not in top 10" label to `&#x27;`, which would break literal-substring
// assertions. The label is a static literal (no user input), so we render
// it raw via dangerouslySetInnerHTML at the call sites.
const NOT_FOUND_LABEL = "İlk 10'da yok";
const NOT_FOUND_TITLE = (iso: string) => `${formatDate(iso)} — İlk 10'da yok`;

export function TrendChart({ observations, keyword }: TrendChartProps) {
  if (observations.length === 0) return null;

  // Reverse to ascending order for charting
  const obs = [...observations].reverse();

  const dates = obs.map((o) => new Date(o.checkedAt).getTime());
  const firstMs = dates[0]!;
  const lastMs = dates[dates.length - 1]!;
  const timeSpan = lastMs - firstMs;

  function xPos(ms: number): number {
    if (timeSpan === 0) return PAD_LEFT + CHART_W / 2;
    return PAD_LEFT + ((ms - firstMs) / timeSpan) * CHART_W;
  }

  function yPos(position: number): number {
    // Inverted: position 1 at top, position 10 at bottom
    return PAD_TOP + ((position - 1) / 9) * CHART_H;
  }

  // Separate in-top-10 points from position=0 points
  const inTop10 = obs.filter((o) => o.position > 0 && o.position <= 10);
  const notFound = obs.filter((o) => o.position === 0);

  // Build polyline points for in-top-10 only (segments break at position=0 gaps)
  const polylinePoints = inTop10
    .map((o) => `${xPos(new Date(o.checkedAt).getTime())},${yPos(o.position)}`)
    .join(" ");

  // X-axis ticks: ~6 spread across the time range
  const tickCount = Math.min(6, obs.length);
  const ticks: Array<{ x: number; label: string }> = [];
  for (let i = 0; i < tickCount; i++) {
    const ratio = tickCount === 1 ? 0.5 : i / (tickCount - 1);
    const ms = firstMs + ratio * timeSpan;
    ticks.push({ x: xPos(ms), label: formatDate(new Date(ms).toISOString()) });
  }

  // Accessibility summary
  const firstPos = obs[0]!.position;
  const lastPos = obs[obs.length - 1]!.position;
  const ariaLabel = `${keyword}: son ${obs.length} günde ${firstPos > 0 ? "#" + firstPos : "ilk 10'da yok"} → ${lastPos > 0 ? "#" + lastPos : "ilk 10'da yok"}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis labels */}
        <text x={PAD_LEFT - 8} y={PAD_TOP + 4} fill="#94a3b8" fontSize="11" textAnchor="end">1</text>
        <text x={PAD_LEFT - 8} y={PAD_TOP + CHART_H + 4} fill="#94a3b8" fontSize="11" textAnchor="end">10</text>

        {/* X-axis ticks */}
        {ticks.map((t, i) => (
          <text key={i} x={t.x} y={VIEW_H - 8} fill="#94a3b8" fontSize="11" textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* Polyline through in-top-10 points */}
        {inTop10.length > 1 && (
          <polyline
            points={polylinePoints}
            stroke="#0f172a"
            strokeWidth="1.5"
            fill="none"
          />
        )}

        {/* In-top-10 points with tooltips */}
        {inTop10.map((o, i) => {
          const x = xPos(new Date(o.checkedAt).getTime());
          const y = yPos(o.position);
          return (
            <circle key={`top-${i}`} cx={x} cy={y} r="3" fill="#0f172a">
              <title>{`${formatDate(o.checkedAt)} — #${o.position}`}</title>
            </circle>
          );
        })}

        {/* Position=0 markers (not in top 10) */}
        {notFound.map((o, i) => {
          const x = xPos(new Date(o.checkedAt).getTime());
          return (
            <circle key={`zero-${i}`} cx={x} cy={ZERO_BAND_Y} r="3" fill="#f59e0b">
              <title dangerouslySetInnerHTML={{ __html: NOT_FOUND_TITLE(o.checkedAt) }} />
            </circle>
          );
        })}
      </svg>

      <details>
        <summary className="text-sm text-slate-600 cursor-pointer">Veri tablosunu göster</summary>
        <table className="mt-2 w-full text-xs text-slate-600">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4 text-left font-semibold">Tarih</th>
              <th scope="col" className="py-1 text-left font-semibold">Sıra</th>
            </tr>
          </thead>
          <tbody>
            {obs.map((o, i) => (
              <tr key={i}>
                <td className="py-1 pr-4 tabular-nums">{formatDate(o.checkedAt)}</td>
                <td className="py-1 tabular-nums">
                  {o.position > 0 ? `#${o.position}` : <span dangerouslySetInnerHTML={{ __html: NOT_FOUND_LABEL }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
