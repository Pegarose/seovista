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
