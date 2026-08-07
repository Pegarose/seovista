import { ResultShell } from "./result-shell";

/**
 * Explicit unknown-status view for tool result pages: exactly one <main>
 * landmark (via ResultShell) with one descriptive <h1>. Rendered for any
 * persisted status outside the supported lifecycle vocabulary so the page
 * never implicitly falls through to the completed-result payload path.
 */
export function UnknownJobStatusView(): React.ReactElement {
  return (
    <ResultShell
      eyebrow="Seovista / Lab report"
      title="We can't find this report"
      status="unknown"
    >
      <p className="text-muted-ink">
        The link may have expired, or the report id is wrong. Start a new audit
        to get a fresh link.
      </p>
      <a
        href="/tools/"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline bg-paper px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-mineral"
      >
        Try again
      </a>
    </ResultShell>
  );
}
