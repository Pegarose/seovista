import type { AttributionTraceResultPayload } from "@seovista/worker";
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
  title: "Citation trace",
} as const;

export async function generateMetadata() {
  return {
    title: "Attribution Trace - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

/** Per-claim attribution kind: human label + design-token chip classes. */
type VerdictKind = "self" | "external" | "misattributed" | "unverifiable";

const KIND_META: Record<VerdictKind, { label: string; chip: string }> = {
  // The four colour families from the legacy KIND_META palette, translated
  // to the editorial tokens: emerald → signal, sky → spectral, rose → ember,
  // slate → muted-ink.
  self: { label: "Your own content", chip: "text-signal border-signal/40" },
  external: { label: "External source", chip: "text-spectral border-spectral/40" },
  misattributed: { label: "Misattributed", chip: "text-ember border-ember/40" },
  unverifiable: { label: "Unverifiable", chip: "text-muted-ink border-hairline" },
};

/**
 * Map the 0–100 sourcedness score onto the editorial verdict variant.
 * The brief's bands for this instrument are exact: ≥90 pass, 70–89 info,
 * <70 fail — there is deliberately no warn band at the score level. A
 * payload with no claims, or whose claims all carry zero best similarity,
 * has nothing measurable to grade, so it renders the neutral info variant
 * and the numeric score is omitted (VerdictCard's "n/100" would otherwise
 * imply a grade where no overlap was observed).
 */
function attributionVariant(payload: AttributionTraceResultPayload): VerdictVariant {
  if (!hasMeasurableSimilarity(payload)) return "info";
  const score = payload.score;
  if (score >= 90) return "pass";
  if (score >= 70) return "info";
  return "fail";
}

/** True when at least one claim carried a measurable overlap (> 0). */
function hasMeasurableSimilarity(payload: AttributionTraceResultPayload): boolean {
  return (
    payload.totalClaims > 0 && payload.verdicts.some((v) => v.bestSimilarity > 0)
  );
}

/** Round a 0–1 similarity into a 0–100 integer for the stats row. */
function pct(value: number): number {
  return Math.round(value * 100);
}

/**
 * Compact stats row values. "Claims checked" is the total claim count;
 * "Sources matched" counts the claims that resolved to a source (own site
 * or SERP); best/avg similarity are derived from the per-claim overlaps.
 */
function statsRow(payload: AttributionTraceResultPayload): {
  claimsChecked: number;
  sourcesMatched: number;
  bestSimilarity: number;
  avgSimilarity: number;
} {
  const similarities = payload.verdicts.map((v) => v.bestSimilarity);
  const best = similarities.length > 0 ? Math.max(...similarities) : 0;
  const avg =
    similarities.length > 0
      ? similarities.reduce((sum, value) => sum + value, 0) / similarities.length
      : 0;
  return {
    claimsChecked: payload.totalClaims,
    sourcesMatched: payload.selfClaims + payload.externalClaims,
    bestSimilarity: pct(best),
    avgSimilarity: pct(avg),
  };
}

/** SERP source shape lifted from the payload (no extra dependency). */
type SerpSource = AttributionTraceResultPayload["serpSources"][number];

/**
 * Resolve the best-source id into the IssueLedger source link. The "self"
 * id resolves to the audited domain; otherwise the SERP source document
 * supplies the label/url. Returns null when the source has no URL so the
 * ledger omits the link instead of rendering a dead anchor.
 */
function resolveSourceUrl(
  bestSourceId: string,
  serpSources: readonly SerpSource[],
  target: string | null,
): { label: string; url: string } | null {
  if (bestSourceId === "self") {
    const domain = target ?? "";
    return {
      label: target ?? "Your site",
      url: domain.startsWith("http") ? domain : `https://${domain}/`,
    };
  }
  const src = serpSources.find((s) => s.id === bestSourceId);
  if (!src || !src.url) return null;
  return { label: src.label, url: src.url };
}

/**
 * Evidence ledger rows for the attribution payload. One row per claim: the
 * title carries the trace verdict ("Source found" when a source clears the
 * 70% overlap threshold, otherwise "Weak or no source"), the detail carries
 * the kind label plus the claim text, and the best-matching source renders
 * as a mono link. Severity stays pass/warn only — per-claim strength needs
 * that distinction even though the overall score has no warn band.
 */
function buildLedgerItems(
  payload: AttributionTraceResultPayload,
  serpSources: readonly SerpSource[],
  target: string | null,
): IssueLedgerItem[] {
  return payload.verdicts.map((verdict, idx) => {
    const similarityPct = Math.round(verdict.bestSimilarity * 100);
    const hasSource =
      typeof verdict.bestSourceId === "string" && verdict.bestSourceId.length > 0;
    const pass = hasSource && similarityPct >= 70;
    const source = hasSource
      ? resolveSourceUrl(verdict.bestSourceId!, serpSources, target)
      : null;
    return {
      id: `claim-${idx}`,
      severity: pass ? "pass" : "warn",
      title: pass ? "Source found" : "Weak or no source",
      detail: `${KIND_META[verdict.kind].label}: ${verdict.claim}`,
      ...(source ? { source } : {}),
    };
  });
}

/** Page-local kind badge key — only the kinds actually present in the data. */
function KindBadges({ payload }: { payload: AttributionTraceResultPayload }) {
  const kinds = (Object.keys(KIND_META) as VerdictKind[]).filter((kind) =>
    payload.verdicts.some((v) => v.kind === kind)
  );
  if (kinds.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kinds.map((kind) => (
        <span
          key={kind}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${KIND_META[kind].chip}`}
        >
          {KIND_META[kind].label}
        </span>
      ))}
    </div>
  );
}

/** Page-local stats cell for the metric row under the verdict. */
function MetricStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-card p-4">
      <p className="font-mono text-2xl text-ink">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-ink">{label}</p>
    </div>
  );
}

export default async function AttributionTraceJobResultPage({
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

  interface AttributionTraceJobRow {
    id: string;
    target: string | null;
    status: string;
    result_payload: unknown;
  }
  let jobRow: AttributionTraceJobRow | undefined;
  try {
    // Results live in job_results (JSONB), joined via correlation_id — the
    // same contract the other tool result pages use. The queue_name filter
    // scopes the lookup to attribution trace audits.
    const res = await db.query<AttributionTraceJobRow>(
      `SELECT j.id, j.target, j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'attribution_trace_audit'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [jobId]
    );
    jobRow = res.rows[0];
  } catch (err) {
    console.error("Failed to query attribution_trace_audit job record:", err);
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
        meta={{ jobId, queueName: "attribution_trace_audit", toolLabel: "Attribution Trace" }}
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
          retryHref="/tools/attribution-trace/"
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

  let payload: AttributionTraceResultPayload | null = null;
  if (status === "completed" && jobRow.result_payload) {
    try {
      const parsed = (typeof jobRow.result_payload === "string"
        ? JSON.parse(jobRow.result_payload)
        : jobRow.result_payload) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as { kind?: unknown }).kind === "attribution-trace"
      ) {
        payload = parsed as AttributionTraceResultPayload;
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
          retryHref="/tools/attribution-trace/"
        />
      </ResultShell>
    );
  }

  // -- Completed: valid payload --
  // (status === "completed" && payload !== null) — narrowed after the
  // degraded early-return above.
  const safePayload = payload!;
  const serpSources = safePayload.serpSources ?? [];
  const stats = statsRow(safePayload);
  const hasScore = hasMeasurableSimilarity(safePayload);

  return (
    <ResultShell
      eyebrow={REPORT_SHELL.eyebrow}
      title={REPORT_SHELL.title}
      status="completed"
      meta={{ jobId, queueName: "attribution_trace_audit", toolLabel: "Attribution Trace" }}
    >
      <div className="flex flex-col gap-6">
        <VerdictCard
          variant={attributionVariant(safePayload)}
          title="Citation trace"
          summary="Which sources support your claims, and how strongly."
          {...(hasScore ? { score: safePayload.score } : {})}
          scoreLabel="Traceability"
        />

        <p className="font-mono text-sm text-muted-ink">
          Page: <span className="break-all text-ink">{jobRow.target ?? "—"}</span>
        </p>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricStat label="Claims checked" value={stats.claimsChecked} />
          <MetricStat label="Sources matched" value={stats.sourcesMatched} />
          <MetricStat label="Best similarity" value={stats.bestSimilarity} />
          <MetricStat label="Avg similarity" value={stats.avgSimilarity} />
        </div>

        <IssueLedger
          heading="Evidence ledger"
          items={buildLedgerItems(safePayload, serpSources, jobRow.target)}
          emptyLabel="No claims were found in the pasted answer."
        />

        <KindBadges payload={safePayload} />

        <p className="text-xs text-muted-ink">
          Scores reflect how strongly search results support the claim text. They are not
          a measure of truth, rank, or content quality.
        </p>

        <a
          href="/tools/schema-truth-check/"
          className="block rounded-lg border border-hairline bg-card p-6 text-sm font-semibold text-ink transition-colors hover:bg-mineral"
        >
          Check whether your structured data supports these claims with the Schema Truth Check →
        </a>
      </div>
    </ResultShell>
  );
}
