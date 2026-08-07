import type { ReactNode } from "react";
import type { AuditMetaStripProps } from "./audit-meta-strip";
import { AuditMetaStrip } from "./audit-meta-strip";
import type { StatusPillVariant } from "./status-pill";
import { StatusPill } from "./status-pill";

/**
 * Shared single-<main> page shell for result pages.
 *
 * Owns the page's sole <main> landmark and sole <h1>, so every tool result
 * page upholds the same landmark contract. Renders an uppercase eyebrow, the
 * serif title with a StatusPill on the baseline, an optional AuditMetaStrip,
 * then the page body.
 */

/** Coarse lifecycle status surfaced in the result-page header. This is the
 *  UI-facing vocabulary; StatusPill expands it into its richer chip variants. */
export type AuditStatusForUi = "checking" | "completed" | "failed" | "unknown";

/** Map the UI lifecycle status onto the richer StatusPill variant set. */
const STATUS_TO_PILL: Record<AuditStatusForUi, StatusPillVariant> = {
  checking: "in_progress",
  completed: "success",
  failed: "failure",
  unknown: "unknown",
};

export interface ResultShellProps {
  /** Short uppercase label rendered above the h1. */
  eyebrow: string;
  /** Page's single <h1> contents. */
  title: string;
  /** Lifecycle status — controls StatusPill variant inside the header. */
  status: AuditStatusForUi;
  /** AuditMetaStrip payload; when omitted the meta strip is not rendered. */
  meta?: AuditMetaStripProps;
  /** Main body. */
  children: ReactNode;
}

export function ResultShell(props: ResultShellProps): React.ReactElement {
  return (
    <main id="main" className="min-h-screen bg-paper text-ink">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-3 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-ink">
              {props.eyebrow}
              <span className="h-px w-10 bg-hairline" aria-hidden="true" />
            </span>
            <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">
              {props.title}
            </h1>
          </div>
          <StatusPill variant={STATUS_TO_PILL[props.status]} />
        </header>

        {props.meta && (
          <div className="mt-6">
            <AuditMetaStrip {...props.meta} />
          </div>
        )}

        <div className="mt-10">{props.children}</div>
      </div>
    </main>
  );
}
