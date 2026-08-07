/**
 * VerdictCard — a single editorial verdict block for result pages.
 *
 * Renders a bordered card with a serif title, a one-paragraph summary, a
 * variant pill (Pass / Warning / Fail / Info) and an optional large serif
 * score out of 100. Pure Server Component using only the SeoVista design
 * tokens (never the slate/gray/indigo utility families).
 */

export type VerdictVariant = "pass" | "warn" | "fail" | "info";

export interface VerdictCardProps {
  /** Verdict variant driving the pill colour. */
  variant: VerdictVariant;
  /** Serif heading inside the card. */
  title: string;
  /** One-paragraph helper under the title. */
  summary: string;
  /** Optional large serif score (number) — renders with /100 suffix. */
  score?: number;
  /** Optional explicit label next to the score; defaults to "Score". */
  scoreLabel?: string;
}

const PILL_CLASS =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest";

const PILL_VARIANT: Record<VerdictVariant, { label: string; className: string }> = {
  pass: { label: "Pass", className: "text-signal border-signal/40" },
  warn: { label: "Warning", className: "text-ember border-ember/40" },
  fail: { label: "Fail", className: "text-ember border-ember/40 bg-mineral/60" },
  info: { label: "Info", className: "text-spectral border-spectral/40" },
};

export function VerdictCard(props: VerdictCardProps): React.ReactElement {
  const { variant, title, summary, score, scoreLabel } = props;
  const pill = PILL_VARIANT[variant];

  return (
    <section className="rounded-lg border border-hairline bg-card p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
          <p className="text-sm text-muted-ink">{summary}</p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <span className={`${PILL_CLASS} ${pill.className}`}>{pill.label}</span>

          {typeof score === "number" && (
            <div className="flex flex-col items-end gap-1">
              <span
                aria-label={`Score: ${score} out of 100`}
                className="font-serif text-5xl text-ink"
              >
                {score}
                <span className="text-xl text-muted-ink">/100</span>
              </span>
              <span className="text-xs text-muted-ink">{scoreLabel ?? "Score"}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
