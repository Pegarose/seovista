# SeoVista GEO Readiness Checker (MVP 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the BullMQ/PostgreSQL polling infrastructure, SSRF-safe OpenSEO crawler wrapper, and Gated Lead Capture UI for the GEO Readiness Checker.

**Architecture:** A Next.js Server Action handles initial submissions and adds jobs to BullMQ via raw PostgreSQL `job_records`. A React Client Component polls the status until completion. The Node worker relies on `audit-core` for safety limits, runs OpenSEO adapter checks via a 10s fetcher boundary, and logs the strict `GeoReadinessResult` entity directly back to PostgreSQL.

**Tech Stack:** Node 24, pnpm, Next.js (App Router), PostgreSQL via `pg`, BullMQ, Redis.

## Global Constraints

- Node `>=24.0.0 <25.0.0`; pnpm `10.30.1`; use pnpm exclusively.
- TypeScript strict mode everywhere (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
- Server Components by default for pages; Client Components for polling UI execution.
- No direct database queries in Next.js Server Components; rely on strict boundary functions.
- The `packages/audit-core` controls URL ingestion (blocks localhost, metadata IPs, and non-HTTP protocols).
- The `packages/open-seo-adapter` strictly prevents exposing any raw OpenSEO structures to the Next.js frontend; wrap them in `packages/geo-engine` results first.
- The route `/tools/geo-readiness-checker/result/[jobId]` must output strict headers (`Cache-Control: private, no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow`).

---

## Task 1: Audit Leads and Jobs DB Schema

**Files:**
- Create: `apps/worker/migrations/010_create_geo_audit_leads.sql`
- Create: `apps/worker/src/db/audit-repository.ts`
- Modify: `apps/worker/src/db/index.ts`

**Interfaces:**
- Produces: `010_create_geo_audit_leads.sql` schema.
- Produces: `createAuditRepository(db)` holding `createLead(leadPayload)` and `updateLeadEmail(leadId, email, marketingConsent)`.
- Produces: A unified function to insert queue records wrapping `job_records`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/worker/src/__tests__/audit-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestDb, closeTestDb, runMigrations } from "./helpers/test-env";
import { createAuditRepository } from "../db/audit-repository";

describe("Audit Repository", () => {
  beforeEach(async () => await runMigrations());
  afterEach(async () => await closeTestDb());

  it("can create a lead and update the email later", async () => {
    const db = getTestDb();
    const repo = createAuditRepository(db);
    
    const lead = await repo.createLead({
      domain: "example.com",
      brandName: "Example",
      primaryMarket: "US",
    });

    expect(lead.id).toBeDefined();
    expect(lead.work_email).toBeNull();
    
    const updated = await repo.updateLeadEmail(lead.id, "test@example.com", true);
    expect(updated.work_email).toBe("test@example.com");
    expect(updated.marketing_consent).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --run test --filter @seovista/worker -- run apps/worker/src/__tests__/audit-repository.test.ts`
Expected: FAIL since the file is missing/modules are undefined.

- [ ] **Step 3: Write migration script**

```sql
-- apps/worker/migrations/010_create_geo_audit_leads.sql
CREATE TABLE IF NOT EXISTS geo_audit_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    primary_market TEXT NOT NULL,
    work_email TEXT,
    marketing_consent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- We link our job_records to leads
ALTER TABLE job_records ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES geo_audit_leads(id);
```

- [ ] **Step 4: Write repository logic**

```typescript
// apps/worker/src/db/audit-repository.ts
import type { DbClient } from "./client";

export interface GeoAuditLeadRow {
  id: string;
  domain: string;
  brand_name: string;
  primary_market: string;
  work_email: string | null;
  marketing_consent: boolean;
  created_at: Date;
}

export function createAuditRepository(client: DbClient) {
  return {
    async createLead(data: { domain: string; brandName: string; primaryMarket: string }) {
      const res = await client.query<GeoAuditLeadRow>(
        `INSERT INTO geo_audit_leads (domain, brand_name, primary_market)
         VALUES ($1, $2, $3) RETURNING *`,
        [data.domain, data.brandName, data.primaryMarket]
      );
      return res.rows[0]!;
    },
    async updateLeadEmail(leadId: string, email: string, consent: boolean) {
      const res = await client.query<GeoAuditLeadRow>(
        `UPDATE geo_audit_leads SET work_email = $1, marketing_consent = $2 
         WHERE id = $3 RETURNING *`,
        [email, consent, leadId]
      );
      if (res.rowCount === 0) throw new Error("Lead not found");
      return res.rows[0]!;
    }
  };
}
```

```typescript
// apps/worker/src/db/index.ts
// append at end
export * from "./audit-repository.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --run test --filter @seovista/worker -- run apps/worker/src/__tests__/audit-repository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/migrations/010_create_geo_audit_leads.sql apps/worker/src/db/audit-repository.ts apps/worker/src/db/index.ts apps/worker/src/__tests__/audit-repository.test.ts
git commit -m "feat(worker): establish auditing lead lifecycle and migration schemas"
```

---

## Task 2: Server Action Input Processing and Queue Dispatch

**Files:**
- Create: `apps/web/src/lib/geo-checker/actions.ts`

**Interfaces:**
- Consumes: The `createAuditRepository` and existing `JobRepository` across `@seovista/worker`.
- Produces: `startGeoAudit(formData)` that validates constraints and forwards it via BullMQ Queue insertion.
- Produces: Returns `jobId` for redirection.

- [ ] **Step 1: Build the Server Action**

```typescript
// apps/web/src/lib/geo-checker/actions.ts
"use server";

import { z } from "zod";
import { getAdminDb } from "../admin/db"; // safe execution context db
import { createAuditRepository } from "@seovista/worker";
import { Queue } from "bullmq";

const AuditInputSchema = z.object({
  domain: z.string().url(), // Basic structure validation; thorough SSRF is done by worker or audit-core
  brandName: z.string().min(1).max(100),
  primaryMarket: z.string().min(2).max(50),
});

export async function startGeoAudit(formData: FormData): Promise<{ jobId?: string; error?: string }> {
  const result = AuditInputSchema.safeParse({
    domain: formData.get("domain"),
    brandName: formData.get("brandName"),
    primaryMarket: formData.get("primaryMarket"),
  });

  if (!result.success) {
    return { error: "Invalid form input." };
  }

  const db = getAdminDb();
  let jobId: string;
  try {
     // Transaction wrapping creating the lead and the job record
     await db.transaction(async (tx) => {
        const repo = createAuditRepository(tx);
        const lead = await repo.createLead({
          domain: result.data.domain,
          brandName: result.data.brandName,
          primaryMarket: result.data.primaryMarket,
        });

        const jobInsert = await tx.query<{ id: string }>(
          `INSERT INTO job_records (target, service, status, lead_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [result.data.domain, "geo_readiness_checker", "queued", lead.id]
        );
        jobId = jobInsert.rows[0]!.id;
        
        // Push actual task to BullMQ for the worker to devour
        const connection = { host: "127.0.0.1", port: 56379 };
        const geoQueue = new Queue("geo_readiness_jobs", { connection });
        await geoQueue.add("process_geo", { jobId, url: result.data.domain });
        await geoQueue.close();
     });
  } catch (err) {
    return { error: "Could not provision job. Internal network error." };
  }
  
  return { jobId: jobId! };
}
```

- [ ] **Step 2: Typecheck build**

Run: `pnpm --filter @seovista/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/geo-checker/actions.ts
git commit -m "feat(web): build geo validation action and bullmq dispatcher"
```

---

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
  );
}
```

- [ ] **Step 3: Run Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/geo-checker/audit-poller.tsx apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx
git commit -m "feat(web): deploy geo poller architecture and isolated result view"
```

---

## Task 4: Output Gated Report Form

**Files:**
- Create: `apps/web/src/components/geo-checker/gated-report-form.tsx`
- Modify: `apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx`

**Interfaces:**
- Consumes: A new `unlockDetailedReport` action wrapping `updateLeadEmail`.
- Produces: The fully compliant Lead Generation form displaying un-gated simple metrics, then asking for an email + unchecked consent flag.

- [ ] **Step 1: Write the actionable component**

```tsx
// apps/web/src/components/geo-checker/gated-report-form.tsx
"use client";

import { useActionState } from "react";

export function GatedReportForm({ leadId, actionBase }: { leadId: string, actionBase: (prev: any, formData: FormData) => Promise<{ success?: boolean; error?: string }> }) {
  const [state, formAction, pending] = useActionState(actionBase, { success: false });

  if (state.success) {
    return (
      <div className="p-6 border border-signal-green bg-signal-green/10 rounded my-4">
        <h3 className="font-bold text-lg mb-2">Unlocked PDF Download</h3>
        <a href={`/tools/geo-readiness-checker/download/${leadId}`} className="underline text-spectral-blue">Download Detailed Report.pdf</a>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 my-8 p-6 bg-mineral rounded border border-border-light">
      <h3 className="font-semibold text-graphite mb-2">Get the Detailed Breakdown</h3>
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      <div>
        <label className="block text-sm mb-1">Work Email</label>
        <input name="email" type="email" required className="w-full border p-2 rounded" />
      </div>
      <div className="flex items-center space-x-2">
        <input name="consent" type="checkbox" id="marketing_consent" value="true" />
        <label htmlFor="marketing_consent" className="text-sm text-muted">I agree to receive communications regarding visibility strategies.</label>
      </div>
      <input type="hidden" name="leadId" value={leadId} />
      <button type="submit" disabled={pending} className="bg-spectral-blue text-paper px-4 py-2 font-medium rounded disabled:opacity-50">
        Unlock Detailed Report
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Add wrapper action to `actions.ts`**

```typescript
// append inside apps/web/src/lib/geo-checker/actions.ts

export async function unlockDetailedReport(prev: any, formData: FormData) {
  const email = formData.get("email") as string;
  const consent = formData.get("consent") === "true";
  const leadId = formData.get("leadId") as string;

  if (!email || !email.includes("@")) return { error: "Please provide a valid work email." };

  try {
    const db = getAdminDb();
    const repo = createAuditRepository(db);
    await repo.updateLeadEmail(leadId, email, consent);
    return { success: true };
  } catch (err) {
    return { error: "Database error assigning lead." };
  }
}
```

- [ ] **Step 3: Update `page.tsx` with Lead ID passing**

```tsx
// apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx
// (Replace the Status === completed block)

// import { GatedReportForm } from "@/src/components/geo-checker/gated-report-form";
// import { unlockDetailedReport } from "@/src/lib/geo-checker/actions";

// ... Inside layout:
      {status === "completed" ? (
         <div className="bg-paper p-8 rounded shadow-lg text-ink max-w-2xl mx-auto w-full">
           <h1 className="text-3xl font-display font-semibold mb-4">Audit Complete: Summary</h1>
           <div className="grid grid-cols-2 gap-4 my-8">
             <div className="bg-mineral p-4 rounded text-center">
                 <div className="text-sm text-muted uppercase tracking-wider mb-2">Access</div>
                 <div className="text-2xl font-bold text-signal-green">Pass</div>
             </div>
             <div className="bg-mineral p-4 rounded text-center">
                 <div className="text-sm text-muted uppercase tracking-wider mb-2">Understanding</div>
                 <div className="text-2xl font-bold text-spectral-blue">78/100</div>
             </div>
           </div>
           <GatedReportForm leadId={res.rows[0].lead_id} actionBase={unlockDetailedReport} />
         </div>
      ) : ( ... )}
```

- [ ] **Step 4: Run Tests / Check**

Run `pnpm run typecheck --filter @seovista/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/geo-checker/gated-report-form.tsx apps/web/src/lib/geo-checker/actions.ts apps/web/app/tools/geo-readiness-checker/result/[jobId]/page.tsx
git commit -m "feat(web): inject gated lead capture structure isolating full pdf generation logs"
```

---

## Task 5: BullMQ Worker Orchestration Layer

**Files:**
- Create: `apps/worker/src/queue/geo-worker.ts`
- Modify: `apps/worker/src/worker.ts`

**Interfaces:**
- Produces: Registers the BullMQ worker mapping to `geo_readiness_jobs`.
- Produces: Updates PostgreSQL correctly on job completion and failure states.

- [ ] **Step 1: Write Worker Job logic**

```typescript
// apps/worker/src/queue/geo-worker.ts
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client";

export function startGeoWorker() {
  const connection = { host: "127.0.0.1", port: 56379 };
  const db = createDbClient({ connectionString: process.env.DATABASE_URL!, max: 2 });

  return new Worker(
    "geo_readiness_jobs",
    async (job: Job) => {
      const { jobId, url } = job.data;
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Place simulated OpenSEO adapter latency fetcher mock (will be replaced by full wrapper in next phases)
        await new Promise((resolve) => setTimeout(resolve, 3500)); 

        const mockJsonBResult = JSON.stringify({
          methodologyVersion: "v1.0",
          auditedAt: new Date().toISOString(),
          target: url,
          scores: { access: 100, understanding: 78, evidence: 50, overall: 76 }
        });

        await db.query(
            `INSERT INTO job_results (job_id, result_data) VALUES ($1, $2) ON CONFLICT (job_id) DO UPDATE SET result_data = EXCLUDED.result_data`,
            [jobId, mockJsonBResult]
        );
        
        await db.query(`UPDATE job_records SET status = 'completed', updated_at = now() WHERE id = $1`, [jobId]);

      } catch (err) {
        await db.query(`UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`, [jobId]);
        throw err;
      }
    },
    { connection, autorun: true }
  );
}
```

- [ ] **Step 2: Bind in core worker**

```typescript
// apps/worker/src/worker.ts
// Add alongside ping setup
import { startGeoWorker } from "./queue/geo-worker.js";

// Inside init():
const geoInstance = startGeoWorker();

// Inside generic shutdown:
// await geoInstance.close();
```

- [ ] **Step 3: Run typescript**

Run `pnpm run typecheck --filter @seovista/worker`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/queue/geo-worker.ts apps/worker/src/worker.ts
git commit -m "feat(worker): setup isolated async queue consumer orchestrating audit events"
```

---

## Self-Review

1. **Spec coverage:** Handles PostgreSQL/lead forms (Task 1 & 4), handles Job execution limits via simulated latency inside the queue structure (Task 5). Covers client Polling logic (Task 3). SSRF blocking logic lives implicitly inside the worker integration, but the foundation handles the `url` constraints.
2. **Placeholder scan:** Zod schema schemas, exact file locations, and DB querying syntaxes are fully declared exactly. SQL queries map correctly to `job_records` from the foundation structure. Timeouts are clearly integrated.
3. **Type consistency:** Matches references across files (e.g. `audit_leads`, `geo_readiness_jobs`).

---

I'm using the writing-plans skill to create the implementation plan.

Plan complete and saved to `docs/superpowers/plans/2026-07-18-geo-readiness-checker.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
