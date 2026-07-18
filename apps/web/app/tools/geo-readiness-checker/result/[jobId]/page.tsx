import { getAdminDb } from "@/lib/admin/db";
import { AuditPoller } from "@/components/geo-checker/audit-poller";
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

  // Polling helper
  async function pollStatus(id: string) {
    "use server";
    await headers();
    const pollDb = getAdminDb();
    const pollRepo = createGeoAuditRepository(pollDb);
    const probe = await pollRepo.getJobRecord(id);
    return probe ? probe.status : "failed";
  }

  return (
    <main className="min-h-screen bg-graphite flex items-center justify-center">
      {status === "completed" ? (
         <div className="bg-paper p-8 rounded shadow-lg text-ink">
           <h1>Audit Complete</h1>
           <p className="text-muted">A short summary goes here pointing to gated form next.</p>
         </div>
      ) : (
         <AuditPoller jobId={jobId} pollAction={pollStatus} />
      )}
    </main>
  );
}
