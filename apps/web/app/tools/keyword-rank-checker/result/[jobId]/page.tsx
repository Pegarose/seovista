import { SERP_LOCALES } from "@seovista/seo-core";
import type { KeywordRankResultPayload } from "@seovista/worker";
import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
import { TrackThisButton } from "../../../../../src/components/tracker/track-this-button";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import {
  ReportErrorPanel,
  ResultShell,
  StatusPill,
  UnknownJobStatusView,
  VerdictCard,
} from "../../../../../src/components/result-pages";

export const dynamic = "force-dynamic";

/** UUID v4/v7 format guard. Rejects malformed IDs before any repository query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared editorial shell identity for every rendered state of this page. */
const REPORT_SHELL = {
  eyebrow: "Seovista / Lab report",
  title: "Rank snapshot",
} as const;

export async function generateMetadata() {
  return {
    title: "Rank snapshot - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function KeywordRankJobResultPage({
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

  interface KeywordRankJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: KeywordRankJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to keyword rank audits.
    const res = await db.query<KeywordRankJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'keyword_rank_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query keyword_rank_audit job record:", err);
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
        meta={{ jobId, queueName: "keyword_rank_audit", toolLabel: "Keyword Rank" }}
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
          retryHref="/tools/keyword-rank-checker/"
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

  let payload: KeywordRankResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "keyword-rank"
      ) {
        payload = parsed as KeywordRankResultPayload;
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
          retryHref="/tools/keyword-rank-checker/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const safePayload = payload!;
  const top10 = safePayload.top10 ?? [];
  const localeMeta = (SERP_LOCALES as Record<string, { label: string }>)[safePayload.locale];
  const localeLabel = localeMeta?.label ?? safePayload.locale;

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{ jobId, queueName: "keyword_rank_audit", toolLabel: "Keyword Rank" }}
    >
      <div className="flex flex-col gap-6">
        {/* This tool reports an observed position snapshot — there is NO
            numeric score, so the score prop is intentionally omitted and the
            verdict is about presence in the top 10. */}
        <VerdictCard
          variant={safePayload.position !== null ? "pass" : "fail"}
          title="Rank snapshot"
          summary="Current positions for your tracked keywords in live search."
        />

        <section className="rounded-lg border border-hairline bg-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-serif text-2xl text-ink">Observed position</h2>
              <p className="text-sm text-muted-ink">
                {safePayload.position !== null
                  ? `The target domain appeared in the top 10 results for "${safePayload.keyword}".`
                  : "The target domain did not appear in the top 10 results."}
              </p>
            </div>
            <div className="shrink-0">
              {safePayload.position !== null ? (
                <span
                  aria-label={`Position: ${safePayload.position}`}
                  className="font-serif text-5xl text-ink"
                >
                  #{safePayload.position}
                </span>
              ) : (
                <StatusPill variant="warning" ariaLabel="Outside top 10" />
              )}
            </div>
          </div>
        </section>

        <p className="font-mono text-sm text-muted-ink">
          Domain: <span className="break-all text-ink">{safePayload.domain}</span> · Keyword:{" "}
          <span className="text-ink">{safePayload.keyword}</span> · Locale:{" "}
          <span className="text-ink">{localeLabel}</span>
        </p>

        {safePayload.dataSource === "mock" ? (
          <div role="status" className="rounded-lg border border-ember/40 bg-mineral/40 px-5 py-4">
            <p className="text-sm text-ember">
              <span className="font-semibold">Sample data</span> — SearXNG is not configured;
              results are deterministic sample data.
            </p>
          </div>
        ) : (
          <div role="status" className="rounded-lg border border-hairline bg-mineral/40 px-5 py-4">
            <p className="text-sm text-muted-ink">
              Data source: SearXNG · Checked at:{" "}
              <span className="font-mono">{safePayload.checkedAt}</span>
            </p>
          </div>
        )}

        <section className="rounded-lg border border-hairline bg-card p-6">
          <h2 className="font-serif text-2xl text-ink">Top 10 results</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-muted-ink">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Title
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    URL
                  </th>
                </tr>
              </thead>
              <tbody>
                {top10.map((entry) => (
                  <tr
                    key={entry.position}
                    className={
                      entry.isTarget
                        ? "border-l-4 border-l-signal bg-mineral"
                        : "border-b border-hairline"
                    }
                  >
                    <td className="py-2 pr-4 font-mono tabular-nums text-muted-ink">
                      {entry.position}
                    </td>
                    <td className="py-2 pr-4 text-ink">
                      {entry.title}
                      {entry.isTarget && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-signal/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-signal">
                          Your site
                        </span>
                      )}
                    </td>
                    <td className="break-all py-2 font-mono text-xs text-muted-ink">
                      {entry.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-hairline bg-card p-6">
          <h2 className="mb-4 font-serif text-2xl text-ink">Daily tracking</h2>
          <TrackThisButton keyword={safePayload.keyword} domain={safePayload.domain} />
        </section>

        <a
          href="/tools/geo-readiness-checker/"
          className="block rounded-lg border border-hairline bg-card p-6 text-sm font-semibold text-ink transition-colors hover:bg-mineral"
        >
          Check your AI-citation readiness with the GEO Readiness Checker →
        </a>

        <CrewReportSection sourceJobId={jobId} tool="keyword-rank" />
      </div>
    </ResultShell>
  );
}
