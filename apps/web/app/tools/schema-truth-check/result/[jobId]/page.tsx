import type { SchemaTruthResultPayload } from "@seovista/worker";
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
  title: "Schema truth",
} as const;

export async function generateMetadata() {
  return {
    title: "Schema truth - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Map the verified/totalClaims ratio onto the editorial verdict variant:
 * ≥90% pass, 70–89% warn, <70% fail. A page with zero extractable claims
 * has nothing to be wrong about, so it renders the neutral info variant —
 * and the numeric score is omitted (see the completed branch) because
 * VerdictCard's "n/100" would otherwise imply a grade where no claim
 * exists.
 */
function truthVariant(payload: SchemaTruthResultPayload): VerdictVariant {
  if (payload.totalClaims === 0) return "info";
  const ratio = payload.verifiedClaims / payload.totalClaims;
  if (ratio >= 0.9) return "pass";
  if (ratio >= 0.7) return "warn";
  return "fail";
}

const NO_CLAIMS_COPY =
  "No claims to check on this page. Either the page has no JSON-LD, or it only uses unsupported @type values (supported: Organization, Person, Article/BlogPosting/NewsArticle, Product, Service).";

/**
 * Evidence ledger rows for the schema truth payload. One row per claim
 * finding: the verdict string ("Verified on page" / "Not found on page") is
 * the row title, the detail carries the claimed field path plus the value
 * stated in the markup, and the severity follows the finding status
 * (verified → pass, not verifiable → warn). JSON-LD parse failures surface
 * as an additional warn row group when the payload carries them.
 */
function buildLedgerItems(payload: SchemaTruthResultPayload): IssueLedgerItem[] {
  const items: IssueLedgerItem[] = payload.findings.map((finding, idx) => ({
    id: `claim-${finding.field}-${idx}`,
    severity: finding.status === "verified" ? "pass" : "warn",
    title: finding.status === "verified" ? "Verified on page" : "Not found on page",
    detail: `${finding.field}: ${finding.value}`,
  }));

  if (payload.parseErrors.length > 0) {
    items.push({
      id: "parse-errors",
      severity: "warn",
      title: "Parse errors",
      detail: payload.parseErrors.join(" · "),
      recommendation:
        "Fix the malformed JSON-LD so each block parses into a valid object.",
    });
  }

  return items;
}

export default async function SchemaTruthJobResultPage({
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

  interface SchemaTruthJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
    submitted_at: string;
  }
  let jobRow: SchemaTruthJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to schema truth audits.
    const res = await db.query<SchemaTruthJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload, j.created_at AS submitted_at
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'schema_truth_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query schema_truth_audit job record:", err);
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
        meta={{
          jobId,
          queueName: "schema_truth_audit",
          toolLabel: "Schema Truth",
          submittedAt: jobRow.submitted_at,
        }}
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
          retryHref="/tools/schema-truth-check/"
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

  let payload: SchemaTruthResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "schema-truth"
      ) {
        payload = parsed as SchemaTruthResultPayload;
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
          retryHref="/tools/schema-truth-check/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const safePayload = payload!;

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{
        jobId,
        queueName: "schema_truth_audit",
        toolLabel: "Schema Truth",
        submittedAt: jobRow.submitted_at,
      }}
    >
      <div className="flex flex-col gap-6">
        <p className="font-mono text-sm text-muted-ink">
          Page: <span className="break-all text-ink">{jobRow.target ?? "—"}</span>
        </p>

        <VerdictCard
          variant={truthVariant(safePayload)}
          title="Truthfulness report"
          summary="Where your markup contradicts on-page facts, and what to fix first."
          {...(safePayload.totalClaims === 0 ? {} : { score: safePayload.score })}
          scoreLabel="Score"
        />

        <IssueLedger
          heading="Evidence ledger"
          items={buildLedgerItems(safePayload)}
          emptyLabel={NO_CLAIMS_COPY}
        />

        <p className="text-xs text-muted-ink">
          The score is the share of JSON-LD claims that appear on the page. It does not predict
          rankings, trust, or rich results.
        </p>

        <a
          href="/tools/schema-checker/"
          className="block rounded-lg border border-hairline bg-card p-6 text-sm font-semibold text-ink transition-colors hover:bg-mineral"
        >
          Compare with the Schema Checker for a full parse log →
        </a>
      </div>
    </ResultShell>
  );
}
