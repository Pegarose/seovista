import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { GatedReportForm } from "../../../../../src/components/geo-checker/gated-report-form";
import { ScoreBreakdownView } from "../../../../../src/components/geo-checker/score-breakdown";
import { CrewCtaView } from "../../../../../src/components/geo-checker/crew-cta-view";
import { MatchedServicesView } from "../../../../../src/components/geo-checker/matched-services-view";
import { notFound } from "next/navigation";
import { createGeoAuditRepository } from "@seovista/worker";
import type { ScoreBreakdown, ScoreBreakdownModule, ScoreBreakdownPlatformReadiness, MatchedService } from "@seovista/geo-engine";
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
    // Per-platform readiness projection (VAL-A-UI-CONF-001 /
    // VAL-A-UI-CONF-002). Defensive parse: legacy payloads persisted before
    // the platformReadiness field was added to the ScoreBreakdown contract
    // degrade to an empty array so the result page simply omits the platform
    // section instead of crashing.
    platformReadiness: readPlatformReadiness(b.platformReadiness),
  };
}

/**
 * Narrow the persisted `breakdown.platformReadiness` array to the
 * `ScoreBreakdownPlatformReadiness[]` contract. Each entry must carry a
 * numeric `score` and `confidence` and a boolean `experimental`; entries
 * that fail the guard are dropped so a single malformed row cannot break the
 * whole section. Returns `[]` for missing / non-array fields so the result
 * page degrades gracefully on legacy payloads.
 */
function readPlatformReadiness(raw: unknown): ScoreBreakdownPlatformReadiness[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreBreakdownPlatformReadiness[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;
    if (
      typeof p.platform !== "string" ||
      typeof p.score !== "number" ||
      typeof p.confidence !== "number"
    ) {
      continue;
    }
    out.push({
      platform: p.platform,
      score: p.score,
      confidence: p.confidence,
      rationale: typeof p.rationale === "string" ? p.rationale : "",
      experimental: Boolean(p.experimental),
    });
  }
  return out;
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
  
  // Matched services must be safely narrowed out of the payload without any client-side sorting/filtering.
  // We extract them exactly as persisted if available.
  const matchedServices = payload && Array.isArray(payload.matchedServices)
    ? payload.matchedServices.reduce<MatchedService[]>((acc, s) => {
        if (s && typeof s === "object") {
          const svc = s as Record<string, unknown>;
          if (typeof svc.service_id === "string" && typeof svc.name === "string" && typeof svc.description === "string") {
            acc.push({
              service_id: svc.service_id,
              name: svc.name,
              description: svc.description,
              matchedTags: Array.isArray(svc.matchedTags) ? svc.matchedTags as any[] : [],
              relevanceScore: typeof svc.relevanceScore === "number" ? svc.relevanceScore : 0,
              addressedIssueCodes: Array.isArray(svc.addressedIssueCodes) ? svc.addressedIssueCodes as string[] : []
            });
          }
        }
        return acc;
      }, [])
    : undefined;

  // The fallback band ensures deterministic CTA copy logic even if breakdown parsing fails.
  // According to expectations: "using a safe fallback band". We can default to "critical" to show the strong CTA.
  const scoreBand = breakdown?.band ?? "critical";

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-8">
      {status === "completed" ? (
        <>
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full">
            <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">Geo Readiness Analiz Sonucu</h1>
            <div className="grid grid-cols-2 gap-4 my-8">
              <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100">
                  <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Erişim</div>
                  <div className="text-2xl font-bold text-emerald-600">Başarılı</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg text-center border border-slate-100">
                  <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-2">Anlama</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {breakdown ? `${breakdown.overallScore}/100` : "Tamamlandı"}
                  </div>
              </div>
            </div>
            
            {!hasEmail && (
              <GatedReportForm leadId={row.lead_id} />
            )}
          </div>
          
          <CrewCtaView scoreBand={scoreBand} />
          {breakdown && <ScoreBreakdownView breakdown={breakdown} />}
          <MatchedServicesView services={matchedServices ?? []} />
        </>
      ) : status === "failed" || status === "timeout" || status === "permanent_failure" ? (
         <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
            <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">Durum: Başarısız</h1>
            <p className="text-slate-700">Analiz işlemi başarısız oldu veya zaman aşımına uğradı. Lütfen daha sonra tekrar deneyin.</p>
         </div>
      ) : (
         <AuditPoller jobId={jobId} />
      )}
    </main>
  );
}

