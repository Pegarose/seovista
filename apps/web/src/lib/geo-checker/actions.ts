// apps/web/src/lib/geo-checker/actions.ts
"use server";

import { z } from "zod";
import { getAdminDb } from "../admin/db"; // safe execution context db
import { createGeoAuditRepository } from "@seovista/worker";
import { Queue } from "bullmq";

const AuditInputSchema = z.object({
  domain: z.string().url(), // Basic structure validation
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
        const _client = {
          query: tx.query.bind(tx),
          transaction: db.transaction.bind(db),
          close: db.close.bind(db)
        };
        const repo = createGeoAuditRepository(_client);
        
        const lead = await repo.createLead({
          domain: result.data.domain,
          brandName: result.data.brandName,
          primaryMarket: result.data.primaryMarket,
        });

        jobId = await repo.createJobRecord({
          target: result.data.domain,
          service: "geo_readiness_checker",
          status: "queued",
          leadId: lead.id,
        });
        
        // Push actual task to BullMQ for the worker to process
        // Using url format for ConnectionOptions
        const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:56379";
        const geoQueue = new Queue("geo_readiness_jobs", { connection: { url: REDIS_URL } });
        await geoQueue.add("process_geo", { jobId, url: result.data.domain });
        await geoQueue.close();
     });
  } catch (err) {
    console.error("Geo audit action error:", err);
    return { error: "Could not provision job. Internal network error." };
  }
  
  return { jobId: jobId! };
}
