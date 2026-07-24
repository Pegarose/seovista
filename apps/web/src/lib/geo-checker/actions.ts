"use server";



import { z } from "zod";
import { redirect } from "next/navigation";
import { getAdminDb } from "../admin/db";
import { createGeoAuditRepository, submitGeoAudit } from "@seovista/worker";

// Ensure schema handles edge cases matching user specifications.
const GeoAuditFormSchema = z.object({
  domain: z
    .string()
    .url("Must be a valid URL")
    .min(1, "Domain is required")
    .refine(
      (val) => {
        try {
          const hostname = new URL(val).hostname.toLowerCase();
          
          if (["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) return false;
          if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("172.16.")) return false;
          if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".corp")) return false;
          
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid target. Internal domains are strictly prohibited." }
    ),
  brandName: z
    .string()
    .min(3, "Brand Name must be greater than 2 characters"),
  primaryMarket: z
    .string()
    .min(1, "Primary Market is required"),
});

export type ActionState = {
  status: "idle" | "error" | "validating";
  errors?: {
    domain?: string[];
    brandName?: string[];
    primaryMarket?: string[];
    form?: string[];
  };
};

export async function startGeoAuditAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    domain: formData.get("domain")?.toString() ?? "",
    brandName: formData.get("brandName")?.toString() ?? "",
    primaryMarket: formData.get("primaryMarket")?.toString() ?? "",
  };

  const validatedFields = GeoAuditFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      status: "error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { domain, brandName, primaryMarket } = validatedFields.data;
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);

  try {
    // Capture a lead for every form submission (each submission is a distinct
    // lead even when the audit job is deduped).
    const lead = await repo.createLead({
      domain,
      brandName,
      primaryMarket,
    });

    // Single-flight dedupe (VAL-A-MIT-001 / VAL-A-MIT-002): before enqueuing,
    // the worker attempts `SET geo:lock:{sha256(url)} <jobId> NX EX 300` in
    // Redis DB 1. When the lock is acquired, one job_records row + one BullMQ
    // job are created. When the lock is already held, the submission is
    // deduped onto the in-flight job and the client polls its status instead
    // of enqueuing a duplicate.
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a geo audit");
    }

    const result = await submitGeoAudit({
      db,
      redisUrl,
      url: domain,
      leadId: lead.id,
      forceAudit: false,
    });

    // Whether a new audit was enqueued or this submission was deduped onto an
    // in-flight job, the client polls the same result page (which renders the
    // AuditPoller until `job_records.status === 'completed'`).
    return redirect(`/tools/geo-readiness-checker/result/${result.jobId}`);
  } catch (error) {
    console.error("Geo audit start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Failed to start audit due to a system error. Please try again later."],
      },
    };
  }
}

export async function checkJobStatusAction(jobId: string) {
  
  
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);

  try {
    const job = await repo.getJobRecord(jobId);
    return { success: true, data: job };
  } catch (error) {
    console.error("Failed to check job status", error);
    return { success: false, error: "Failed to check job status" };
  }
}

export async function unlockDetailedReport(_prev: any, formData: FormData): Promise<{ success?: boolean; error?: string }> {
  
  
  // Actually update lead marketing data since this is the gated form handler
  const leadId = formData.get("leadId")?.toString();
  const email = formData.get("email")?.toString();
  const consent = formData.get("consent") === "true";
  
  if (!leadId || !email) {
    return { error: "Missing required fields" };
  }
  
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);
  
  try {
    await repo.updateLeadEmail(leadId, email, consent);
    return { success: true };
  } catch (err) {
    console.error("Failed to unlock report", err);
    return { error: "Failed to update lead information. Please try again." };
  }
}

