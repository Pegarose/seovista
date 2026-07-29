"use server";



import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { createGeoAuditRepository, submitGeoAudit, checkIpRateLimit } from "@seovista/worker";
import { extractClientIp } from "./ip";
import { normalizeAuditStatusRecord } from "./audit-status";

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
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a geo audit");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.AUDIT_PER_IP_RATE_LIMIT) || 10;

    const rateLimit = await checkIpRateLimit({
      redisUrl,
      ip: clientIp,
      limit,
    });

    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [`Rate limit exceeded. Maximum ${limit} audits per hour allowed. Please try again later.`],
        },
      };
    }

    // Capture a lead for every form submission (each submission is a distinct
    // lead even when the audit job is deduped).
    const lead = await repo.createLead({
      domain,
      brandName,
      primaryMarket,
    });

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkJobStatusAction(jobId: string) {
  if (!UUID_RE.test(jobId)) {
    return { success: false, error: "Invalid job ID format" };
  }
  
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);

  try {
    const job = await repo.getJobRecord(jobId);
    
    if (!job) {
       return { success: true, data: null };
    }
    
    const { status } = normalizeAuditStatusRecord(job);
    
    return {
      success: true,
      data: {
        status,
        // Only return minimal DTO required by AuditPoller. Do NOT leak lead_id or work_email.
      },
    };
  } catch (error) {
    console.error("Failed to check job status", error);
    return { success: false, error: "Failed to check job status" };
  }
}

export async function unlockDetailedReport(_prev: any, formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const jobId = formData.get("jobId")?.toString();
  const leadId = formData.get("leadId")?.toString();
  const email = formData.get("email")?.toString();
  const consent = formData.get("consent") === "true";
  
  if (!jobId || !leadId || !email) {
    return { error: "Missing required fields" };
  }

  if (!UUID_RE.test(jobId) || !UUID_RE.test(leadId)) {
    return { error: "Invalid job or lead format" };
  }
  
  const db = getAdminDb();
  const repo = createGeoAuditRepository(db);
  
  try {
    await repo.updateLeadEmailForJob(jobId, leadId, email, consent);
    return { success: true };
  } catch (err) {
    console.error("Failed to unlock report", err);
    return { error: "Failed to update lead information. Please try again." };
  }
}

