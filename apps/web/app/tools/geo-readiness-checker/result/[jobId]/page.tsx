import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { GatedReportForm } from "../../../../../src/components/geo-checker/gated-report-form";
import { ScoreBreakdownView } from "../../../../../src/components/geo-checker/score-breakdown";
import { notFound } from "next/navigation";
import { createGeoAuditRepository } from "@seovista/worker";
import type { ScoreBreakdown, ScoreBreakdownModule } from "@seovista/geo-engine";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Checking AI Readiness - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Narrow the persisted `job_results.payload.breakdown` field to the
 * `ScoreBreakdown` contract without recomputing any score. The worker
 * serializes the engine's `ScoreBreakdown` directly into the JSONB payload,
 * so a minimal structural guard is sufficient. Returns `null` for legacy
 * payloads persisted before the breakdown contract was introduced so the
 * result page degrades gracefully instead of crashing.
 */
function readBreakdown(payload: Record<string, unknown> | null): ScoreBreakdown | null {
  if (!payload) return null;
  const raw = payload.breakdown;
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.scoreVersion !== "string" || typeof b.overallScore !== "number") {
    return null;
  }
  const modules = b.modules;
  if (!Array.isArray(modules)) return null;
  const safeModules: ScoreBreakdownModule[] = [];
  for (const m of modules) {
    if (!m || typeof m !== "object") return null;
    const mod = m as Record<string, unknown>;
    if (
      typeof mod.key !== "string" ||
      typeof mod.name !== "string" ||
      typeof mod.score !== "number" ||
      typeof mod.maxScore !== "number" ||
      typeof mod.status !== "string" ||
      !Array.isArray(mod.issues)
    ) {
      return null;
    }
    safeModules.push({
      key: mod.key,
      name: mod.name,
      score: mod.score,
      maxScore: mod.maxScore,
      status: mod.status as ScoreBreakdownModule["status"],
      issues: (mod.issues as unknown[]).map((i) => {
        const iss = (i ?? {}) as Record<string, unknown>;
        return {
          code: typeof iss.code === "string" ? iss.code : "",
          message: typeof iss.message === "string" ? iss.message : "",
          pointLoss: typeof iss.pointLoss === "number" ? iss.pointLoss : 0,
          severity: typeof iss.severity === "string" ? (iss.severity as ScoreBreakdownModule["issues"][number]["severity"]) : "info",
          module: typeof iss.module === "string" ? iss.module : "",
        };
      }),
    });
  }
  return {
    scoreVersion: b.scoreVersion,
    overallScore: b.overallScore,
    band: (typeof b.band === "string" ? b.band : "needs_improvement") as ScoreBreakdown["band"],
    modules: safeModules,
  };
}

export default async function JobResultPage({ params }: { params: Promise<{ jobId: string }> }) {
  await headers();
  const { jobId } = await params;
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);

  // 1. Initial State Read
  const row = await repo.getJobRecord(jobId);
  if (!row) return notFound();

  const status = row.status;
  const hasEmail = Boolean(row.work_email);

  // 2. Score breakdown payload (rendered without recomputation). Fetched only
  // when the job is completed so we never block the polling path on a result
  // row that does not exist yet.
  const payload = status === "completed" ? await repo.getJobResultPayload(jobId) : null;
  const breakdown = readBreakdown(payload);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
      {status === "completed" ? (
        <>
          {hasEmail ? (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-full max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold text-slate-900 mb-6 font-display">Full Raw Dashboard</h1>
              <div className="bg-slate-50 p-6 rounded-lg text-slate-700 text-sm mb-6 border border-slate-200">
                 <p className="mb-4">This is the fully unlocked raw dashboard. Since this is Sprint 0, the OpenSEO visual mock data would normally render here. Your domain has been successfully analyzed.</p>
                 <ul className="list-disc pl-5 space-y-2 text-slate-600">
                    <li>AI Model A: Recognized 95% of keywords</li>
                    <li>AI Model B: High confidence visibility</li>
                    <li>Citation Index: Strong backlink profile in knowledge graph</li>
                 </ul>
              </div>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full">
              <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">Audit Complete: Summary</h1>
              <div className="grid grid-cols-2 gap-4 my-8">
                <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100">
                    <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Access</div>
                    <div className="text-2xl font-bold text-emerald-600">Pass</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100">
                    <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Understanding</div>
                    <div className="text-2xl font-bold text-blue-600">78/100</div>
                </div>
              </div>
              <GatedReportForm leadId={row.lead_id} />
            </div>
          )}

          {breakdown ? (
            <ScoreBreakdownView breakdown={breakdown} />
          ) : null}
        </>
      ) : (
         <AuditPoller jobId={jobId} />
      )}
    </main>
  );
}

