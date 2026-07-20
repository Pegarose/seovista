import "server-only";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getAdminDb } from "../admin/db";
import { createGeoAuditRepository } from "@seovista/worker";

// Ensure schema handles edge cases matching user specifications.
const GeoAuditFormSchema = z.object({
  domain: z
    .string()
    .url("Must be a valid URL")
    .min(1, "Domain is required"),
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
    const lead = await repo.createLead({
      domain,
      brandName,
      primaryMarket,
    });

    const jobId = await repo.createJobRecord({
      target: lead.domain,
      service: "geo_audit",
      status: "queued",
      leadId: lead.id,
    });

    // Assume BullMQ worker catches this dynamically if configured to read 'queued' status on job_records, 
    // or trigger explicit event queue processing here if required, though task says:
    // "Trigger background BullMQ event theoretically OR just assume the background worker catches "queued" records dynamically."

    // Redirect uses returning action block natively inside standard next actions handling, but since this executes server-side:
    // we use `redirect` here.
    return redirect(`/tools/geo-readiness-checker/result/${jobId}`);
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
  "use server";
  
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
  "use server";
  
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
