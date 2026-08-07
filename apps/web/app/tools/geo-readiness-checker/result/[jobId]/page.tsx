import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { GatedReportForm } from "../../../../../src/components/geo-checker/gated-report-form";
import { ScoreBreakdownView } from "../../../../../src/components/geo-checker/score-breakdown";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
import { MatchedServicesView } from "../../../../../src/components/geo-checker/matched-services-view";
import { SerpPreview } from "../../../../../src/components/geo-checker/serp-preview";
import { createGeoAuditRepository, type DbClient } from "@seovista/worker";
import type {
  ScoreBreakdown,
  ScoreBreakdownIssue,
  ScoreBreakdownModule,
} from "@seovista/geo-engine";
import {
  parseCompletedPayload,
  type ParsedScoreBreakdown,
} from "../../../../../src/lib/geo-checker/payload-parser";
import {
  isAuditInFlightStatus,
  normalizeAuditStatusRecord,
} from "../../../../../src/lib/geo-checker/audit-status";
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
  title: "Citation readiness",
} as const;

/**
 * Map the engine's persisted band onto the editorial verdict variant.
 * Bands are the closed ScoreBreakdown union: excellent | good |
 * needs_improvement | poor | critical.
 */
function bandToVariant(band: ScoreBreakdown["band"]): VerdictVariant {
  switch (band) {
    case "excellent":
    case "good":
      return "pass";
    case "needs_improvement":
      return "warn";
    case "poor":
    case "critical":
      return "fail";
    default:
      return "info";
  }
}

/**
 * Verdict summary from the persisted breakdown. The current engine payload
 * carries no `helperText` field, so this reads it defensively and falls back
 * to the editorial default rather than inventing a per-run claim.
 */
function breakdownSummary(breakdown: ParsedScoreBreakdown): string {
  const helperText = (breakdown as ParsedScoreBreakdown & { helperText?: unknown })
    .helperText;
  return typeof helperText === "string" && helperText.length > 0
    ? helperText
    : "How large language models describe your pages, and where citations drop off.";
}

/**
 * Evidence ledger rows for the geo readiness payload — the spec's "ranked
 * citation gaps". Preferred source is the per-platform AI readiness
 * projection sorted by `score` ascending (worst first): each row is the
 * platform name, a severity derived from its score band (experimental
 * estimates never pass), and a detail carrying the rationale plus the
 * confidence percentage. When the projection is missing or empty, the
 * fallback enumerates every module issue sorted by `pointLoss` ascending
 * (most negative first). No claim is invented — each row only describes
 * the persisted breakdown values.
 */
function buildGeoLedgerItems(breakdown: ParsedScoreBreakdown): IssueLedgerItem[] {
  const platforms = breakdown.platformReadiness;

  if (platforms && platforms.length > 0) {
    return [...platforms]
      .sort((a, b) => a.score - b.score)
      .map((p) => {
        let severity: VerdictVariant;
        if (p.experimental) {
          severity = "warn";
        } else if (p.score >= 80) {
          severity = "pass";
        } else if (p.score >= 60) {
          severity = "warn";
        } else {
          severity = "fail";
        }
        const detailParts: string[] = [];
        if (p.rationale) detailParts.push(p.rationale);
        detailParts.push(`Confidence: ${Math.round(p.confidence * 100)}%`);
        if (p.experimental) detailParts.push("Experimental estimate");
        return {
          id: `platform-${p.platform}`,
          severity,
          title: p.platform,
          detail: detailParts.join(" "),
        };
      });
  }

  const issueEntries: Array<{ mod: ScoreBreakdownModule; issue: ScoreBreakdownIssue }> =
    [];
  for (const mod of breakdown.modules) {
    for (const issue of mod.issues) {
      issueEntries.push({ mod, issue });
    }
  }
  issueEntries.sort((a, b) => a.issue.pointLoss - b.issue.pointLoss);

  return issueEntries.map(({ mod, issue }) => {
    // The engine's Severity union (critical/high/medium/low/info/experimental)
    // drives the row tone: critical/high -> fail, medium/low/experimental ->
    // warn, info -> info. The string comparison stays future-proof if the
    // union ever grows error/warning members.
    const severity = issue.severity as string;
    const mappedSeverity =
      severity === "critical" || severity === "high" || severity === "error"
        ? "fail"
        : severity === "medium" ||
            severity === "low" ||
            severity === "warning" ||
            severity === "experimental"
          ? "warn"
          : "info";
    return {
      id: `${mod.key}-${issue.code}`,
      severity: mappedSeverity,
      title: issue.message,
      detail: `${mod.name} · ${
        issue.pointLoss < 0
          ? "−" + Math.abs(issue.pointLoss) + " pts"
          : "No point loss"
      }`,
    };
  });
}

export async function generateMetadata() {
  return {
    title: "Checking AI Readiness - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function JobResultPage({ params }: { params: Promise<{ jobId: string }> }) {
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
  let repo: ReturnType<typeof createGeoAuditRepository>;
  try {
    db = getAdminDb();
    repo = createGeoAuditRepository(db);
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

  let row: Awaited<ReturnType<typeof repo.getJobRecord>>;
  try {
    row = await repo.getJobRecord(jobId);
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

  // Syntactically valid UUID with no matching job record renders the
  // documented not-found state.
  if (!row) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="unknown">
        <ReportErrorPanel
          title="Report not found"
          body="The requested report could not be found. Check the job id and try again."
        />
      </ResultShell>
    );
  }

  const normalizedRow = normalizeAuditStatusRecord(row);
  const status = normalizedRow.status;
  const hasEmail = Boolean(row.work_email);

  // ---------- Result payload (completed only) ----------
  let payload: Record<string, unknown> | null = null;
  if (status === "completed") {
    try {
      payload = await repo.getJobResultPayload(jobId);
    } catch {
      // Degrade gracefully: the completed job row exists but the result
      // payload could not be fetched. Render the degraded completed-result
      // state rather than failing with a raw error.
      payload = null;
    }
  }
  const parsedPayload = status === "completed" ? parseCompletedPayload(payload) : null;
  const breakdown = parsedPayload?.breakdown ?? null;
  const matchedServices = parsedPayload?.matchedServices;
  const scoreBand = breakdown?.band ?? null;
  const targetUrl = parsedPayload?.targetUrl ?? null;
  const serpPreview = parsedPayload?.serpPreview ?? null;
  const aiPreview = parsedPayload?.aiPreview ?? null;
  const hasAnyPreview = serpPreview !== null || aiPreview !== null;

  // ---------- Render ----------

  // -- In-flight states (queued / running / pending) --
  if (isAuditInFlightStatus(status)) {
    return (
      <ResultShell
        eyebrow={REPORT_SHELL.eyebrow}
        title={REPORT_SHELL.title}
        status="checking"
        meta={{
          jobId,
          queueName: "geo_readiness_audit",
          toolLabel: "Geo Readiness",
          submittedAt: row.submitted_at,
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
  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="failed">
        <ReportErrorPanel
          title="Report failed"
          body="We could not finish this audit. Keep the reference id below when you ask for help."
          correlationId={jobId}
          retryHref="/tools/geo-readiness-checker/"
        />
      </ResultShell>
    );
  }

  // -- Unknown persisted status: explicit unavailable state --
  // Any status value not in the supported lifecycle vocabulary renders
  // exactly one <main> with one descriptive <h1>, no result components,
  // and no raw Next.js error boundary. The page never implicitly returns
  // undefined for an unrecognised status.
  if (status === "unknown") {
    return <UnknownJobStatusView />;
  }

  // -- Completed: degraded (no valid result payload) --
  if (status === "completed" && !breakdown) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="failed">
        <ReportErrorPanel
          title="Report data is incomplete"
          body="The audit finished, but the stored result is unreadable. Rerun the audit to regenerate it."
          retryHref="/tools/geo-readiness-checker/"
        />
        {!hasEmail && row.lead_id ? (
          <GatedReportForm leadId={row.lead_id} jobId={jobId} />
        ) : null}
      </ResultShell>
    );
  }

  // -- Completed: degraded breakdown --
  // A persisted degraded marker means one or more scoring modules failed. The
  // numeric projection is still useful to the worker, but it is not a complete
  // readiness result for a public claim. Fail closed instead of presenting a
  // partial score, CTA, target, services, platform readiness, or preview as
  // if every required signal were available.
  if (status === "completed" && breakdown?.degraded === true) {
    return (
      <ResultShell eyebrow={REPORT_SHELL.eyebrow} title={REPORT_SHELL.title} status="failed">
        <ReportErrorPanel
          title="Report data is incomplete"
          body="The audit finished, but one or more scoring modules failed. Rerun the audit to regenerate it."
          retryHref="/tools/geo-readiness-checker/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid breakdown payload --
  // (status === "completed" && breakdown !== null)
  // Narrow breakdown after the degraded early-return above.
  const safeBreakdown = breakdown!;
  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{
        jobId,
        queueName: "geo_readiness_audit",
        toolLabel: "Geo Readiness",
        submittedAt: row.submitted_at,
      }}
    >
      <div className="flex flex-col gap-6">
        <VerdictCard
          variant={bandToVariant(safeBreakdown.band)}
          title="Citation readiness"
          summary={breakdownSummary(safeBreakdown)}
          score={safeBreakdown.overallScore}
          scoreLabel="Score"
        />

        <IssueLedger
          heading="Evidence ledger"
          items={buildGeoLedgerItems(safeBreakdown)}
          emptyLabel="No issues found."
        />

        {!hasEmail && row.lead_id ? (
          <GatedReportForm leadId={row.lead_id} jobId={jobId} />
        ) : null}

        {scoreBand && <CrewCtaView scoreBand={scoreBand} />}

        {targetUrl && (
          <p className="text-sm text-muted-ink">
            Audited URL:{" "}
            <span className="font-mono text-muted-ink break-all">{targetUrl}</span>
          </p>
        )}

        {hasAnyPreview && (
          <div className="flex flex-col gap-4">
            <h2 className="font-serif text-xl text-ink">SERP &amp; AI Answer Previews</h2>
            {serpPreview && (
              <SerpPreview {...serpPreview} />
            )}
            {aiPreview && (
              <SerpPreview {...aiPreview} />
            )}
          </div>
        )}

        <ScoreBreakdownView breakdown={safeBreakdown} />
        {matchedServices !== undefined && <MatchedServicesView services={matchedServices} />}

        <CrewReportSection sourceJobId={jobId} tool="geo-readiness" />
      </div>
    </ResultShell>
  );
}
