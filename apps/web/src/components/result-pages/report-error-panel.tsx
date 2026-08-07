/**
 * Shared terminal failure panel for result pages.
 *
 * A polite live region (<section role="status" aria-live="polite">) that
 * announces when a report cannot be produced. Optionally surfaces a
 * technical correlation id (mono) and an editorial secondary retry link
 * back to the tool's form page.
 */

export interface ReportErrorPanelProps {
  /** Bold heading, e.g. "Report failed". */
  title: string;
  /** Body copy describing why. */
  body: string;
  /** Optional technical correlation id rendered as mono at the bottom. */
  correlationId?: string;
  /** Optional retry CTA (href back to the tool's form page). */
  retryHref?: string;
  /** Retry link label. Defaults to "Try again". */
  retryLabel?: string;
}

export function ReportErrorPanel(props: ReportErrorPanelProps): React.ReactElement {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-lg border border-dashed border-ember/40 bg-mineral/40 p-8"
    >
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ember">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
        Something went wrong
      </p>
      <h2 className="mt-3 font-serif text-2xl text-ink">{props.title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-ink">{props.body}</p>
      {props.correlationId && (
        <code className="mt-4 block break-all font-mono text-xs text-muted-ink">
          {props.correlationId}
        </code>
      )}
      {props.retryHref && (
        <div className="mt-6">
          <a
            href={props.retryHref}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline bg-paper px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-mineral"
          >
            {props.retryLabel ?? "Try again"}
          </a>
        </div>
      )}
    </section>
  );
}
