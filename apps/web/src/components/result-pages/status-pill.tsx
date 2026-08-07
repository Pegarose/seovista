/**
 * Shared lifecycle StatusPill for result pages.
 *
 * Renders a single-role chip whose color/label are driven entirely by the
 * variant discriminator. Uses only the SeoVista editorial design tokens
 * (never the slate, gray, or indigo utility families). The chip carries
 * role="status" and a human-readable aria-label so the terminal lifecycle is
 * announced to assistive technology.
 */

export type StatusPillVariant = "in_progress" | "success" | "warning" | "failure" | "unknown";

export interface StatusPillProps {
  /** Variant discriminator driving color/label. */
  variant: StatusPillVariant;
  /** Custom aria-label; defaults derived from variant. */
  ariaLabel?: string;
}

const VARIANT_LABELS: Record<StatusPillVariant, string> = {
  in_progress: "In progress",
  success: "Complete",
  warning: "Needs attention",
  failure: "Failed",
  unknown: "Status unknown",
};

/** Chip shell shared by every variant — the color family only changes
 *  the text/border/dot, never the geometry or typography. */
const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest";

const VARIANT_CLASS: Record<StatusPillVariant, { chip: string; dot: string }> = {
  in_progress: { chip: "text-spectral border-spectral/40", dot: "bg-spectral" },
  success: { chip: "text-signal border-signal/40", dot: "bg-signal" },
  warning: { chip: "text-ember border-ember/40", dot: "bg-ember" },
  failure: { chip: "text-ember border-ember/40", dot: "bg-ember" },
  unknown: { chip: "text-muted-ink border-hairline", dot: "bg-muted-ink/60" },
};

export function StatusPill(props: StatusPillProps): React.ReactElement {
  const label = props.ariaLabel ?? VARIANT_LABELS[props.variant];
  const style = VARIANT_CLASS[props.variant];

  return (
    <span
      role="status"
      aria-label={label}
      className={`${CHIP_CLASS} ${style.chip}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
