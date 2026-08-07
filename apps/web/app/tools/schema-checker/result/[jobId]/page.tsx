import { getAdminDb } from "../../../../../src/lib/admin/db";
import type { DbClient } from "@seovista/worker";
import { SchemaGraphTree } from "../../../../../src/components/schema-checker/schema-graph-tree";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
import { isAuditInFlightStatus } from "../../../../../src/lib/geo-checker/audit-status";
import { normalizeJobResultStatus } from "../../../../../src/lib/admin/job-result-guard";
import { getSchemaScoreBand, type SchemaScoreBand } from "../../../../../src/lib/score-band";
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
  title: "Structured data coverage",
} as const;

export async function generateMetadata() {
  return {
    title: "Structured data coverage - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

interface SchemaAuditResultPayload {
  rawScriptCount: number;
  validNodes: Record<string, unknown>[];
  parseErrors: string[];
  prohibitedClaims: Array<{ field: string; reason: string }>;
  score: number;
}

/**
 * Map the score band onto the editorial verdict variant. Bands are the
 * closed SchemaScoreBand union from the shared score-band helper:
 * excellent | good | needs_improvement | poor | critical.
 */
function bandToVariant(band: SchemaScoreBand): VerdictVariant {
  switch (band) {
    case "excellent":
    case "good":
      return "pass";
    case "needs_improvement":
      return "warn";
    case "poor":
    case "critical":
      return "fail";
  }
}

/**
 * Evidence ledger rows for the schema audit payload. One row per metric the
 * payload actually carries (script count, parsed objects, parse errors,
 * prohibited claims), then detail rows that enumerate the stored parse
 * errors and prohibited claims when present. Severities stay proportional to
 * the numbers: parse errors warn, prohibited claims fail, count rows are
 * neutral. No claim is invented — each row only describes the payload values.
 */
function buildLedgerItems(payload: SchemaAuditResultPayload): IssueLedgerItem[] {
  const parseErrorCount = payload.parseErrors?.length ?? 0;
  const prohibitedClaimCount = payload.prohibitedClaims?.length ?? 0;
  const validNodeCount = Array.isArray(payload.validNodes) ? payload.validNodes.length : 0;

  const items: IssueLedgerItem[] = [
    {
      id: "raw-script-count",
      severity: "info",
      title: "Schema scripts detected",
      detail: `${payload.rawScriptCount} JSON-LD script block(s) found in the page source.`,
    },
    {
      id: "valid-node-count",
      severity: "info",
      title: "Valid Schema.org objects",
      detail: `${validNodeCount} object(s) parsed from the detected scripts.`,
    },
    {
      id: "parse-error-count",
      severity: parseErrorCount > 0 ? "warn" : "pass",
      title: "Parse errors",
      detail: `${parseErrorCount} JSON-LD block(s) could not be parsed.`,
    },
    {
      id: "prohibited-claim-count",
      severity: prohibitedClaimCount > 0 ? "fail" : "pass",
      title: "Prohibited claims",
      detail: `${prohibitedClaimCount} claim(s) flagged as prohibited or deceptive.`,
    },
  ];

  if (prohibitedClaimCount > 0) {
    items.push({
      id: "prohibited-claims-detail",
      severity: "fail",
      title: "Prohibited claim details",
      detail: payload.prohibitedClaims
        .map((claim) => `${claim.field}: ${claim.reason}`)
        .join(" · "),
      recommendation:
        "Remove or rewrite these claims so search engines and AI systems can trust the markup.",
    });
  }

  if (parseErrorCount > 0) {
    items.push({
      id: "parse-errors-detail",
      severity: "warn",
      title: "Parse error details",
      detail: payload.parseErrors.join(" · "),
      recommendation: "Fix the malformed JSON-LD so each block parses into a valid object.",
    });
  }

  return items;
}

export default async function SchemaJobResultPage({
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

  let db: DbClient;
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

  interface SchemaJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: SchemaJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the geo repository's getJobResultPayload uses. The
    // queue_name filter scopes the lookup to schema audits.
    const res = await db.query<SchemaJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'schema_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query schema_audit job record:", err);
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
        meta={{ jobId, queueName: "schema_audit", toolLabel: "Schema Checker" }}
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
          retryHref="/tools/schema-checker/"
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

  let payload: SchemaAuditResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      payload = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as SchemaAuditResultPayload;
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
          retryHref="/tools/schema-checker/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const safePayload = payload!;
  const scoreBand = getSchemaScoreBand(safePayload.score);

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{ jobId, queueName: "schema_audit", toolLabel: "Schema Checker" }}
    >
      <div className="flex flex-col gap-6">
        <VerdictCard
          variant={bandToVariant(scoreBand)}
          title="Structured data coverage"
          summary="Which Schema.org types are present, valid, and eligible for rich results."
          score={safePayload.score}
          scoreLabel="Score"
        />

        <IssueLedger heading="Evidence ledger" items={buildLedgerItems(safePayload)} />

        <SchemaGraphTree nodes={safePayload.validNodes || []} />

        <CrewCtaView scoreBand={scoreBand} />

        <CrewReportSection sourceJobId={jobId} tool="schema" />
      </div>
    </ResultShell>
  );
}
