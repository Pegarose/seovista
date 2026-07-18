import { useEffect, useMemo, useState } from "react";

/**
 * WCAG 2.1 contrast checker for the current design tokens.
 * Resolves each token to sRGB by asking the browser to compute the
 * background-color of a probe element, then computes the ratio.
 */

type TokenName =
  | "paper"
  | "mineral"
  | "ink"
  | "muted-ink"
  | "signal"
  | "signal-foreground"
  | "spectral";

const TOKENS: readonly TokenName[] = [
  "paper",
  "mineral",
  "ink",
  "muted-ink",
  "signal",
  "signal-foreground",
  "spectral",
];

// Foreground / background pairs used across the interface.
const PAIRS: readonly {
  label: string;
  usage: string;
  fg: TokenName;
  bg: TokenName;
  large?: boolean;
}[] = [
  { label: "Body copy", usage: "text-ink on bg-paper", fg: "ink", bg: "paper" },
  {
    label: "Muted copy",
    usage: "text-muted-ink on bg-paper",
    fg: "muted-ink",
    bg: "paper",
  },
  {
    label: "Muted on mineral",
    usage: "text-muted-ink on bg-mineral",
    fg: "muted-ink",
    bg: "mineral",
  },
  {
    label: "Primary button",
    usage: "text-signal-foreground on bg-signal",
    fg: "signal-foreground",
    bg: "signal",
  },
  {
    label: "Signal accent",
    usage: "text-signal on bg-paper",
    fg: "signal",
    bg: "paper",
    large: true,
  },
  {
    label: "Spectral eyebrow",
    usage: "text-spectral on bg-paper",
    fg: "spectral",
    bg: "paper",
    large: true,
  },
  {
    label: "Ink on mineral",
    usage: "text-ink on bg-mineral",
    fg: "ink",
    bg: "mineral",
  },
];

function parseRgb(input: string): [number, number, number] | null {
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const conv = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
}

function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveTokens(): Record<TokenName, [number, number, number]> | null {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.width = "1px";
  probe.style.height = "1px";
  document.body.appendChild(probe);
  try {
    const out = {} as Record<TokenName, [number, number, number]>;
    for (const t of TOKENS) {
      probe.style.backgroundColor = `var(--${t})`;
      const computed = getComputedStyle(probe).backgroundColor;
      const rgb = parseRgb(computed);
      if (!rgb) return null;
      out[t] = rgb;
    }
    return out;
  } finally {
    probe.remove();
  }
}

type Grade = "AAA" | "AA" | "AA Large" | "Fail";

function grade(ratio: number, large: boolean): Grade {
  if (large) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA";
    return "Fail";
  }
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

const GRADE_STYLES: Record<Grade, string> = {
  AAA: "bg-signal/15 text-signal border-signal/40",
  AA: "bg-signal/10 text-signal border-signal/30",
  "AA Large": "bg-spectral/10 text-spectral border-spectral/30",
  Fail: "bg-ember/10 text-ember border-ember/40",
};

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) =>
    Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function ContrastMatrix() {
  const [colors, setColors] = useState<
    Record<TokenName, [number, number, number]> | null
  >(null);

  useEffect(() => {
    setColors(resolveTokens());
    // Re-resolve when the color scheme flips.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setColors(resolveTokens());
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const rows = useMemo(() => {
    if (!colors) return [];
    return PAIRS.map((pair) => {
      const ratio = contrastRatio(colors[pair.fg], colors[pair.bg]);
      return {
        ...pair,
        ratio,
        grade: grade(ratio, pair.large ?? false),
        fgHex: rgbToHex(colors[pair.fg]),
        bgHex: rgbToHex(colors[pair.bg]),
      };
    });
  }, [colors]);

  return (
    <section
      aria-labelledby="contrast-matrix-heading"
      className="rounded-lg border border-hairline bg-card p-6"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-spectral">
            Accessibility
          </div>
          <h2
            id="contrast-matrix-heading"
            className="mt-1 font-serif text-2xl text-ink"
          >
            WCAG contrast check
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-ink">
            Ratios are computed live from the design tokens in your current
            color scheme. AAA ≥ 7:1, AA ≥ 4.5:1, AA Large ≥ 3:1.
          </p>
        </div>
      </header>

      {!colors ? (
        <p
          role="status"
          className="mt-6 text-sm text-muted-ink"
          aria-live="polite"
        >
          Resolving design tokens…
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">
              WCAG contrast ratios for interface color pairs.
            </caption>
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-widest text-muted-ink">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Pair
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Preview
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Ratio
                </th>
                <th scope="col" className="py-2 font-medium">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-hairline/60 align-middle"
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium text-ink">{row.label}</div>
                    <div className="mt-0.5 text-xs text-muted-ink">
                      {row.usage}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-ink">
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-3 rounded-sm border border-hairline"
                          style={{ background: row.fgHex }}
                        />
                        {row.fgHex}
                      </span>
                      <span aria-hidden="true">/</span>
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="inline-block h-3 w-3 rounded-sm border border-hairline"
                          style={{ background: row.bgHex }}
                        />
                        {row.bgHex}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="inline-flex items-center rounded px-3 py-1.5"
                      style={{ background: row.bgHex, color: row.fgHex }}
                    >
                      <span
                        className={
                          row.large
                            ? "text-lg font-semibold"
                            : "text-sm"
                        }
                      >
                        Aa sample
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-sm text-ink">
                    {row.ratio.toFixed(2)}:1
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${GRADE_STYLES[row.grade]}`}
                      aria-label={`Grade ${row.grade}, ratio ${row.ratio.toFixed(2)} to 1`}
                    >
                      {row.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
