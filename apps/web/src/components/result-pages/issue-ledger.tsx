/**
 * IssueLedger — a numbered, severity-toned evidence ledger for result pages.
 *
 * Renders a section heading plus a list of rows, each with a mono left-edge
 * index tinted by severity, a serif title, detail copy, an optional actionable
 * recommendation, and an optional mono source link. Pure Server Component using
 * only the SeoVista design tokens (never the slate/gray/indigo utility families).
 */

import type { VerdictVariant } from "./verdict-card";

export interface IssueLedgerItem {
  /** Stable key (correlation id, field name, etc). */
  id: string;
  /** Severity drives the left-edge tone. */
  severity: VerdictVariant;
  /** Bold headline of the row. */
  title: string;
  /** Paragraph detail rendered under the title. */
  detail: string;
  /** Optional actionable recommendation. */
  recommendation?: string;
  /** Optional raw source / href rendered as a mono link. */
  source?: { label: string; url: string };
}

export interface IssueLedgerProps {
  /** Section heading rendered as <h2> (e.g. "Evidence ledger"). */
  heading: string;
  /** Rows. */
  items: readonly IssueLedgerItem[];
  /** Empty state copy; default "No issues found." */
  emptyLabel?: string;
}

const SEVERITY_INDEX_CLASS: Record<VerdictVariant, string> = {
  pass: "text-signal",
  warn: "text-ember",
  fail: "text-ember",
  info: "text-spectral",
};

export function IssueLedger(props: IssueLedgerProps): React.ReactElement {
  const { heading, items, emptyLabel } = props;

  return (
    <section>
      <h2 className="font-serif text-2xl text-ink">{heading}</h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-ink">{emptyLabel ?? "No issues found."}</p>
      ) : (
        <ul>
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="grid grid-cols-[auto_1fr] gap-4 border-t border-hairline py-6 first:border-t-0"
            >
              <span className={`font-mono ${SEVERITY_INDEX_CLASS[item.severity]}`}>
                {String(idx + 1).padStart(2, "0")}
              </span>

              <div className="flex flex-col gap-1">
                <h3 className="font-serif text-lg text-ink">{item.title}</h3>
                <p className="text-sm text-muted-ink">{item.detail}</p>

                {item.recommendation && (
                  <p className="text-sm text-signal">→ {item.recommendation}</p>
                )}

                {item.source && (
                  <a
                    href={item.source.url}
                    className="font-mono text-xs text-muted-ink underline"
                  >
                    {item.source.label}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
