import type { RenderParityResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import {
  IssueLedger,
  ReportErrorPanel,
  ResultShell,
  UnknownJobStatusView,
  VerdictCard,
  type IssueLedgerItem,
  type VerdictVariant,
} from "../../../../../src/components/result-pages";

export const dynamic = "force-dynamic";

/** UUID v4/v7 format guard. Rejects malformed IDs before any repository query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared editorial shell identity for every rendered state of this page. */
const REPORT_SHELL = {
  eyebrow: "Seovista / Lab report",
  title: "Render parity",
} as const;

export async function generateMetadata() {
  return {
    title: "Render parity - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Map the rendered-parity ratio (0–1 token overlap of the two visible
 * texts) onto the editorial verdict variant: ≥0.95 pass, 0.85–0.949 warn,
 * <0.85 fail.
 */
function parityVariant(ratio: number): VerdictVariant {
  if (ratio >= 0.95) return "pass";
  if (ratio >= 0.85) return "warn";
  return "fail";
}

/** Similarity bar fill, driven by the same ratio bands as the verdict. */
const PARITY_BAR_FILL: Record<VerdictVariant, string> = {
  pass: "bg-signal",
  warn: "bg-ember",
  fail: "bg-ember",
  info: "bg-spectral",
};

/** One side of the render parity comparison (the stored RenderSide payload). */
type RenderSideView = RenderParityResultPayload["default"];

/**
 * Browser/crawler metadata card. Kept as a two-column side-by-side grid of
 * its own (NOT folded into the IssueLedger) so the raw per-side metadata —
 * final URL, HTTP status, title, meta description, canonical, H1s, token
 * count — stays directly comparable.
 */
function SideCard({ label, side }: { label: string; side: RenderSideView }) {
  return (
    <section className="rounded-lg border border-hairline bg-card p-6">
      <h2 className="font-serif text-xl text-ink">{label}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">Final URL</dt>
          <dd className="break-all text-right font-mono text-xs text-ink">{side.url}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">HTTP</dt>
          <dd className="font-mono text-ink">{side.status}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">Title</dt>
          <dd className="text-right text-ink">{side.title || "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">Meta description</dt>
          <dd className="text-right text-ink">{side.metaDescription || "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">Canonical</dt>
          <dd className="break-all text-right font-mono text-xs text-ink">
            {side.canonical || "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">H1</dt>
          <dd className="text-right text-ink">{side.h1.length > 0 ? side.h1.join(" · ") : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-ink">Text token count</dt>
          <dd className="font-mono text-ink">{side.tokenCount}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Evidence ledger rows for the render parity payload. Divergence issues map
 * severity (error → fail, warning → warn) with the issue field plus its
 * description as the row detail; H1s present in only one of the two
 * requests render as their own fail-toned rows.
 */
function buildLedgerItems(payload: RenderParityResultPayload): IssueLedgerItem[] {
  const items: IssueLedgerItem[] = payload.issues.map((issue, idx) => ({
    id: `issue-${issue.field}-${idx}`,
    severity: issue.severity === "error" ? "fail" : "warn",
    title: issue.severity === "error" ? "Error" : "Warning",
    detail: `${issue.field}: ${issue.description}`,
  }));

  if (payload.h1OnlyInDefault.length > 0) {
    items.push({
      id: "h1-only-in-default",
      severity: "fail",
      title: "H1s only in the default request",
      detail: payload.h1OnlyInDefault.map((h1) => `"${h1}"`).join(" · "),
    });
  }

  if (payload.h1OnlyInCrawler.length > 0) {
    items.push({
      id: "h1-only-in-crawler",
      severity: "fail",
      title: "H1s only in the crawler request",
      detail: payload.h1OnlyInCrawler.map((h1) => `"${h1}"`).join(" · "),
    });
  }

  return items;
}

export default async function RenderParityJobResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  // Reject malformed non-UUID job IDs before any repository query so invalid
  // input never reaches PostgreSQL and renders the documented not-found state.
  if (!UUID_RE.test(jobId)) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="unknown">
        <ReportErrorPanel
          title="Report not found"
          body="The requested report could not be found. Check the job id and try again."
        />
      </ResultShell>
    );
  }

  let db;
  try {
    db = getAdminDb();
  } catch {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="unknown">
        <ReportErrorPanel
          title="Service temporarily unavailable"
          body="The report service is temporarily unavailable. Please try again shortly."
        />
      </ResultShell>
    );
  }

  interface RenderParityJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: RenderParityJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to render parity audits.
    const res = await db.query<RenderParityJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'render_parity_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query render_parity_audit job record:", err);
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="unknown">
        <ReportErrorPanel
          title="Service temporarily unavailable"
          body="The report service is temporarily unavailable. Please try again shortly."
        />
      </ResultShell>
    );
  }

  // Syntactically valid UUID with no matching job record renders the
  // documented not-found state.
  if (!jobRow) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="unknown">
        <ReportErrorPanel
          title="Report not found"
          body="The requested report could not be found. Check the job id and try again."
        />
      </ResultShell>
    );
  }

  // Normalize the persisted status into the public lifecycle vocabulary so
  // an unrecognised persisted value renders the explicit unknown-status
  // state instead of falling through to the completed-result payload path.
  const status = normalizeJobResultStatus(jobRow.status);

  // -- In-flight states (queued / running / pending) --
  if (isAuditInFlightStatus(status)) {
    return (
      <ResultShell
        eyebrow={REPORT_SHELL.eyebrow}
        title={REPORT_SHELL.title}
        status="checking"
        meta={{ jobId, queueName: "render_parity_audit", toolLabel: "Render Parity" }}
      >
        <p className="text-sm text-muted-ink">
          The audit is running. This page refreshes automatically.
        </p>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </ResultShell>
    );
  }

  // -- Terminal failed states --
  if (
    status === "failed" ||
    status === "timeout" ||
    status === "permanent" ||
    status === "permanent_failure"
  ) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="failed">
        <ReportErrorPanel
          title="Report failed"
          body="We could not finish this audit. Keep the reference id below when you ask for help."
          correlationId={jobId}
          retryHref="/tools/render-parity-diff/"
        />
      </ResultShell>
    );
  }

  // -- Unknown persisted status: explicit unavailable state --
  // Any status value not in the supported lifecycle vocabulary renders the
  // shared explicit-unknown view rather than crashing on the result payload.
  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  let payload: RenderParityResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "render-parity"
      ) {
        payload = parsed as RenderParityResultPayload;
      }
    } catch {
      payload = null;
    }
  }

  // -- Completed: degraded (no valid result payload) --
  if (status === "completed" && !payload) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="failed">
        <ReportErrorPanel
          title="Report data is incomplete"
          body="The audit finished, but the stored result is unreadable. Rerun the audit to regenerate it."
          retryHref="/tools/render-parity-diff/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const p = payload!;
  const ratio = p.renderedParityRatio;
  const similarityPercent = Math.round(ratio * 100);

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{ jobId, queueName: "render_parity_audit", toolLabel: "Render Parity" }}
    >
      <div className="flex flex-col gap-6">
        <p className="font-mono text-sm text-muted-ink">
          Page: <span className="break-all text-ink">{jobRow.target ?? "—"}</span>
        </p>

        <VerdictCard
          variant={parityVariant(ratio)}
          title="Parity report"
          summary="Differences between raw HTML and the rendered page AI systems see."
          score={p.score}
          scoreLabel="Score"
        />

        <section className="rounded-lg border border-hairline bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-ink">
              Text similarity
            </p>
            <p className="font-mono text-sm text-ink">{similarityPercent}%</p>
          </div>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-mineral"
            aria-hidden="true"
          >
            <div
              className={`h-full rounded-full ${PARITY_BAR_FILL[parityVariant(ratio)]}`}
              style={{ width: `${similarityPercent}%` }}
            />
          </div>
        </section>

        <IssueLedger heading="Evidence ledger" items={buildLedgerItems(p)} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SideCard label="Default (browser) request" side={p.default} />
          <SideCard label="Crawler (bot) request" side={p.crawler} />
        </div>
      </div>
    </ResultShell>
  );
}
