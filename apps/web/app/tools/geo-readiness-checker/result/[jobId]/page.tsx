import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { GatedReportForm } from "../../../../../src/components/geo-checker/gated-report-form";
import { ScoreBreakdownView } from "../../../../../src/components/geo-checker/score-breakdown";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { CrewReportSection } from "../../../../../src/components/crew-report/crew-report-section";
import { MatchedServicesView } from "../../../../../src/components/geo-checker/matched-services-view";
import { SerpPreview } from "../../../../../src/components/geo-checker/serp-preview";
import { createGeoAuditRepository, type DbClient } from "@seovista/worker";
import { parseCompletedPayload } from "../../../../../src/lib/geo-checker/payload-parser";
import {
  isAuditInFlightStatus,
  normalizeAuditStatusRecord,
} from "../../../../../src/lib/geo-checker/audit-status";

export const dynamic = "force-dynamic";

/** UUID v4/v7 format guard. Rejects malformed IDs before any repository query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Job not found
          </h1>
          <p className="text-slate-700">
            The requested audit result could not be found. Please check the job identifier and try again.
          </p>
        </div>
      </main>
    );
  }

  let db: DbClient;
  let repo: ReturnType<typeof createGeoAuditRepository>;
  try {
    db = getAdminDb();
    repo = createGeoAuditRepository(db);
  } catch {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Service temporarily unavailable
          </h1>
          <p className="text-slate-700">
            The audit result service is currently unavailable. Please try again shortly.
          </p>
        </div>
      </main>
    );
  }

  let row: Awaited<ReturnType<typeof repo.getJobRecord>>;
  try {
    row = await repo.getJobRecord(jobId);
  } catch {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Service temporarily unavailable
          </h1>
          <p className="text-slate-700">
            The audit result service is currently unavailable. Please try again shortly.
          </p>
        </div>
      </main>
    );
  }

  // Syntactically valid UUID with no matching job record renders the
  // documented not-found state.
  if (!row) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Job not found
          </h1>
          <p className="text-slate-700">
            The requested audit result could not be found. Please check the job identifier and try again.
          </p>
        </div>
      </main>
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
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
        <h1 className="text-3xl font-display font-semibold text-slate-900 text-center">
          {status === "queued" ? "Audit in queue" : status === "running" ? "Audit running…" : "Audit pending"}
        </h1>
        <AuditPoller jobId={jobId} initialStatus={status} />
      </main>
    );
  }

  // -- Terminal failed states --
  if (status === "failed" || status === "timeout" || status === "permanent" || status === "permanent_failure") {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">Durum: Başarısız</h1>
          <p className="text-slate-700">Analiz işlemi başarısız oldu veya zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.</p>
        </div>
      </main>
    );
  }

  // -- Unknown persisted status: explicit unavailable state --
  // Any status value not in the supported lifecycle vocabulary renders
  // exactly one <main> with one descriptive <h1>, no result components,
  // and no raw Next.js error boundary. The page never implicitly returns
  // undefined for an unrecognised status.
  if (status === "unknown") {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Audit status unavailable
          </h1>
          <p className="text-slate-700">
            The audit result status could not be determined. Please refresh the page or try again later.
          </p>
        </div>
      </main>
    );
  }

  // -- Completed: degraded (no valid result payload) --
  if (status === "completed" && !breakdown) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Result temporarily unavailable
          </h1>
          <p className="text-slate-700">
            The audit completed but the detailed result data is not currently available. Please try refreshing the page shortly.
          </p>
        </div>
        {!hasEmail && row.lead_id ? (
          <GatedReportForm leadId={row.lead_id} jobId={jobId} />
        ) : null}
      </main>
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
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Result temporarily unavailable
          </h1>
          <p className="text-slate-700">
            The audit completed with incomplete scoring data. A complete readiness result is not available yet.
          </p>
        </div>
      </main>
    );
  }

  // -- Completed: valid breakdown payload --
  // (status === "completed" && breakdown !== null)
  // Narrow breakdown after the degraded early-return above.
  const safeBreakdown = breakdown!;
  return (
    <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">Geo Readiness Analiz Sonucu</h1>
        <div className="my-8 bg-slate-50 p-4 rounded-lg text-center border border-slate-100">
          <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Anlama</div>
          <div className="text-2xl font-bold text-blue-600">
            {`${safeBreakdown.overallScore}/100`}
          </div>
        </div>
        
        {!hasEmail && (
          <GatedReportForm leadId={row.lead_id} jobId={jobId} />
        )}
      </div>
      
      {scoreBand && <CrewCtaView scoreBand={scoreBand} />}
      
      {targetUrl && (
        <div className="max-w-2xl mx-auto w-full">
          <p className="text-sm text-slate-500">
            Audited URL:{" "}
            <span className="font-mono text-slate-700 break-all">{targetUrl}</span>
          </p>
        </div>
      )}
      
      {hasAnyPreview && (
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">SERP &amp; AI Answer Previews</h2>
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

      <div className="max-w-2xl mx-auto w-full">
        <CrewReportSection sourceJobId={jobId} tool="geo-readiness" />
      </div>
    </main>
  );
}

