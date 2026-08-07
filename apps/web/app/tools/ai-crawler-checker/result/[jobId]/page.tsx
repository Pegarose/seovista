import { getAdminDb } from "../../../../../src/lib/admin/db";
import { CrawlerAccessMatrix } from "../../../../../src/components/ai-crawler-checker/crawler-access-matrix";
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
  title: "AI crawler access",
} as const;

export async function generateMetadata() {
  return {
    title: "AI Crawler Access - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

interface AiCrawlerAuditResultPayload {
  score: number;
  robotsTxtFound: boolean;
  robotsTxtUrl: string;
  sitemaps: string[];
  crawlers: Array<{
    userAgent: string;
    label: string;
    category: "ai-training" | "ai-search" | "search";
    status: "allowed" | "blocked" | "partial";
  }>;
  conflicts: Array<{ description: string; lines: string[] }>;
  recommendations: string[];
  parseErrors: string[];
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
 * Evidence ledger rows for the AI crawler audit payload. One row per signal
 * the payload actually carries (robots.txt presence, sitemap files, parse
 * errors, rule conflicts, recommendations), then detail rows that enumerate
 * the stored parse errors, conflicts, and recommendations when present.
 * Severities stay proportional to the data: a missing robots.txt, parse
 * errors, and rule conflicts warn; count rows stay neutral. No claim is
 * invented — each row only describes the payload values.
 */
function buildLedgerItems(payload: AiCrawlerAuditResultPayload): IssueLedgerItem[] {
  const parseErrorCount = payload.parseErrors?.length ?? 0;
  const conflictCount = payload.conflicts?.length ?? 0;
  const recommendationCount = payload.recommendations?.length ?? 0;
  const sitemapCount = Array.isArray(payload.sitemaps) ? payload.sitemaps.length : 0;
  const robotsTxtUrl =
    typeof payload.robotsTxtUrl === "string" ? payload.robotsTxtUrl : "";

  const items: IssueLedgerItem[] = [
    {
      id: "robots-txt-status",
      severity: payload.robotsTxtFound ? "pass" : "warn",
      title: "robots.txt",
      detail: payload.robotsTxtFound
        ? `robots.txt was found and parsed at ${robotsTxtUrl}.`
        : `No robots.txt was found at ${robotsTxtUrl}. Without a file, all crawlers may access the site by default.`,
    },
    {
      id: "sitemap-count",
      severity: "info",
      title: "Sitemap files",
      detail:
        sitemapCount > 0
          ? `${sitemapCount} sitemap file(s) referenced in robots.txt: ${payload.sitemaps.join(", ")}.`
          : "No sitemap file is referenced in robots.txt.",
    },
    {
      id: "parse-error-count",
      severity: parseErrorCount > 0 ? "warn" : "pass",
      title: "Parse errors",
      detail: `${parseErrorCount} robots.txt rule(s) could not be parsed.`,
    },
    {
      id: "rule-conflict-count",
      severity: conflictCount > 0 ? "warn" : "pass",
      title: "Rule conflicts",
      detail: `${conflictCount} conflicting rule(s) detected in robots.txt.`,
    },
    {
      id: "recommendation-count",
      severity: "info",
      title: "Recommendations",
      detail: `${recommendationCount} recommendation(s) from the audit.`,
    },
  ];

  if (parseErrorCount > 0) {
    items.push({
      id: "parse-errors-detail",
      severity: "warn",
      title: "Parse error details",
      detail: payload.parseErrors.join(" · "),
      recommendation: "Fix the malformed robots.txt rules so every line parses correctly.",
    });
  }

  if (conflictCount > 0) {
    items.push({
      id: "rule-conflicts-detail",
      severity: "warn",
      title: "Rule conflict details",
      detail: payload.conflicts
        .map((conflict) =>
          conflict.lines.length > 0
            ? `${conflict.description} (${conflict.lines.join(" · ")})`
            : conflict.description,
        )
        .join(" · "),
      recommendation: "Resolve the conflicting rules so crawler access is unambiguous.",
    });
  }

  if (recommendationCount > 0) {
    items.push({
      id: "recommendations-detail",
      severity: "info",
      title: "Recommendation details",
      detail: payload.recommendations.join(" · "),
    });
  }

  return items;
}

export default async function AiCrawlerJobResultPage({
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

  interface AiCrawlerJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
    submitted_at: string;
  }
  let jobRow: AiCrawlerJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the geo repository's getJobResultPayload uses. The
    // queue_name filter scopes the lookup to AI crawler audits.
    const res = await db.query<AiCrawlerJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload, j.created_at AS submitted_at
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'ai_crawler_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query ai_crawler_audit job record:", err);
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
          queueName: "ai_crawler_audit",
          toolLabel: "AI Crawler",
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
          retryHref="/tools/ai-crawler-checker/"
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

  let payload: AiCrawlerAuditResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      payload = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as AiCrawlerAuditResultPayload;
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
          retryHref="/tools/ai-crawler-checker/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const safePayload = payload!;
  const crawlers = safePayload.crawlers ?? [];
  const scoreBand = getSchemaScoreBand(safePayload.score);

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{
        jobId,
        queueName: "ai_crawler_audit",
        toolLabel: "AI Crawler",
        submittedAt: jobRow.submitted_at,
      }}
    >
      <div className="flex flex-col gap-6">
        <VerdictCard
          variant={bandToVariant(scoreBand)}
          title="AI crawler access"
          summary="Whether AI training and retrieval bots can read this site."
          score={safePayload.score}
          scoreLabel="Score"
        />

        <p className="text-sm text-muted-ink">
          Page: <span className="font-mono text-muted-ink break-all">{jobRow.target ?? "—"}</span>
        </p>

        <IssueLedger heading="Evidence ledger" items={buildLedgerItems(safePayload)} />

        <CrawlerAccessMatrix crawlers={crawlers} />

        <CrewCtaView scoreBand={scoreBand} />

        <CrewReportSection sourceJobId={jobId} tool="ai-crawler" />
      </div>
    </ResultShell>
  );
}
