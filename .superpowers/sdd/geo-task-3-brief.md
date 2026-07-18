## Task 3: Polling React Server/Client UI Boundary

**Files:**
- Create: `apps/web/src/components/geo-checker/audit-poller.tsx`
- Create: `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx`

**Interfaces:**
- Consumes: A fast RPC-like read parameter grabbing the state status.
- Produces: Polling UI view handing off automatically once DB reflects `'completed'`.

- [ ] **Step 1: Write the Poller Hook UI**

```tsx
// apps/web/src/components/geo-checker/audit-poller.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AuditPoller({ jobId, pollAction }: { jobId: string, pollAction: (id: string) => Promise<string> }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("queued");

  useEffect(() => {
    if (status === "completed" || status === "failed") {
      router.refresh(); // forces Next.js Server Components inside the layout to refresh with newly established DB state
      return;
    }

    const interval = setInterval(async () => {
      try {
        const current = await pollAction(jobId);
        if (current !== status) {
          setStatus(current);
        }
      } catch (err) {
        setStatus("failed");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, status, pollAction, router]);

  if (status === "completed") return null; // unmount completely to reveal underlying finished server content
  if (status === "failed") return <div className="text-red-500 p-8">Audit process failed or timed out. Please try again.</div>;

  return (
    <div className="flex flex-col items-center justify-center p-24 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal-green"></div>
      <p className="text-muted tracking-widest font-mono text-sm uppercase">
        {status === "queued" ? "Waiting in Queue..." : "Scanning Assets..."}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Server Implementation Layer**

```tsx
// apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx
import { getAdminDb } from "@/src/lib/admin/db";
import { AuditPoller } from "@/src/components/geo-checker/audit-poller";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  return {
    title: "Checking AI Readiness - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function JobResultPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const db = getAdminDb();
  
  // 1. Initial State Read
  const res = await db.query("SELECT status, lead_id FROM job_records WHERE id = $1", [jobId]);
  if (res.rowCount === 0) return notFound();
  
  const status = res.rows[0].status;

  // Polling helper
  async function pollStatus(id: string) {
    "use server";
    const pollDb = getAdminDb();
    const probe = await pollDb.query("SELECT status FROM job_records WHERE id = $1", [id]);
    return probe.rows[0]?.status || "failed";
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
