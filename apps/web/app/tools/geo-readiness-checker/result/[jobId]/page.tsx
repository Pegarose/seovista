import { getAdminDb } from "../../../../../src/lib/admin/db";
import { AuditPoller } from "../../../../../src/components/geo-checker/audit-poller";
import { GatedReportForm } from "../../../../../src/components/geo-checker/gated-report-form";
import { notFound } from "next/navigation";
import { createGeoAuditRepository } from "@seovista/worker";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Checking AI Readiness - SeoVista",
    robots: { index: false, follow: false, nocache: true },
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

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      {status === "completed" ? (
        hasEmail ? (
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
        )
      ) : (
         <AuditPoller jobId={jobId} />
      )}
    </main>
  );
}
