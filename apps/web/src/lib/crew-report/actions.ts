"use server";

import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import {
  checkIpRateLimit,
  createGeoAuditRepository,
  submitCrewReport,
  type CrewReportResultPayload,
} from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { normalizeJobResultStatus } from "../admin/job-result-guard";
import type { AuditStatus } from "../geo-checker/audit-status";
import { validateCrewReportInput } from "./validation";

export type CrewReportActionState = {
  status: "idle" | "error" | "started";
  crewJobId?: string;
  errors?: {
    sourceJobId?: string[];
    tool?: string[];
    email?: string[];
    consent?: string[];
    form?: string[];
  };
};

export async function startCrewReportAction(
  _prevState: CrewReportActionState,
  formData: FormData
): Promise<CrewReportActionState> {
  const validated = validateCrewReportInput({
    sourceJobId: formData.get("sourceJobId")?.toString() ?? "",
    tool: formData.get("tool")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
    consent: formData.get("consent") === "true",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { sourceJobId, tool, email, consent } = validated.data;

  // Env-presence gate BEFORE the rate limiter: when CrewAgency is not
  // configured the honest Turkish "not configured" form error is returned
  // instead of consuming rate-limit budget or submitting a job that can
  // never complete. No mock/fallback report is ever generated.
  if (!process.env.CREW_AGENCY_API_URL || !process.env.CREW_AGENCY_API_KEY) {
    return {
      status: "error",
      errors: {
        form: ["AI strateji raporu servisi henüz yapılandırılmadı."],
      },
    };
  }

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the existing system-error contract
    // instead of an unhandled 500.
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a crew report");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.CREW_REPORT_PER_IP_RATE_LIMIT) || 5;

    const rateLimit = await checkIpRateLimit({
      redisUrl,
      ip: clientIp,
      limit,
      bucket: "crew-report",
    });

    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [
            `Saatlik rapor limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`,
          ],
        },
      };
    }

    // Source-job verification: the geo repository reads job_records by id
    // without a queue filter, so any of the four tool chains' jobs can be
    // verified through it. Only a completed source job may seed a report.
    const repo = createGeoAuditRepository(db);
    const sourceJob = await repo.getJobRecord(sourceJobId);
    if (!sourceJob || normalizeJobResultStatus(sourceJob.status) !== "completed") {
      return {
        status: "error",
        errors: {
          form: [
            "AI strateji raporu yalnızca tamamlanmış bir denetim sonucu için oluşturulabilir.",
          ],
        },
      };
    }

    // getJobRecord does not select the target column, so the lead domain is
    // fetched with a dedicated lookup; a missing target degrades to the
    // documented "unknown" fallback.
    const targetRes = await db.query<{ target: string | null }>(
      `SELECT target FROM job_records WHERE id = $1`,
      [sourceJobId]
    );
    const domain = targetRes.rows[0]?.target ?? "unknown";

    // Happy-path order (plan Task 3): createLead → submitCrewReport →
    // updateLeadEmailForJob. The lead is captured on the web side before
    // submission; the crew report chain itself does not dedupe.
    const lead = await repo.createLead({
      domain,
      brandName: "SeoVista Tools",
      primaryMarket: "tr",
    });

    const result = await submitCrewReport({ db, redisUrl, sourceJobId, tool });

    await repo.updateLeadEmailForJob(result.jobId, lead.id, email, consent);

    return { status: "started", crewJobId: result.jobId };
  } catch (error) {
    // NEXT_REDIRECT digest rethrow kept for consistency with the sibling
    // tool actions even though this action never redirects.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("Crew report start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle rapor başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CrewReportStatusData {
  status: AuditStatus;
  /** Parsed `crew-report:result` payload — present only when completed. */
  report?: CrewReportResultPayload;
}

export type CrewReportStatusResult =
  | { success: true; data: CrewReportStatusData | null }
  | { success: false; error: string };

export async function checkCrewReportStatusAction(
  crewJobId: string
): Promise<CrewReportStatusResult> {
  if (!UUID_RE.test(crewJobId)) {
    return { success: false, error: "Invalid job ID format" };
  }

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the existing failure contract
    // instead of an unhandled 500.
    const db = getAdminDb();

    // Mirrors checkJobStatusAction but scoped to the crew_report queue and
    // joined to job_results so the completed report payload can be returned.
    // Only the lifecycle status and the report payload leave the server —
    // never lead data (lead_id / work_email).
    interface CrewReportJobRow {
      status: string;
      result_payload: unknown;
    }
    const res = await db.query<CrewReportJobRow>(
      `SELECT j.status, r.payload AS result_payload
       FROM job_records j
       LEFT JOIN job_results r ON r.correlation_id = j.correlation_id
       WHERE j.id = $1 AND j.queue_name = 'crew_report'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [crewJobId]
    );
    const row = res.rows[0];

    if (!row) {
      return { success: true, data: null };
    }

    const status = normalizeJobResultStatus(row.status);

    let report: CrewReportResultPayload | undefined;
    if (status === "completed" && row.result_payload) {
      try {
        const parsed = (
          typeof row.result_payload === "string"
            ? JSON.parse(row.result_payload)
            : row.result_payload
        ) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as { kind?: unknown }).kind === "crew-report" &&
          typeof (parsed as { reportMarkdown?: unknown }).reportMarkdown === "string"
        ) {
          report = parsed as CrewReportResultPayload;
        }
      } catch {
        report = undefined;
      }
    }

    return {
      success: true,
      data: {
        status,
        ...(report ? { report } : {}),
      },
    };
  } catch (error) {
    console.error("Failed to check crew report status", error);
    return { success: false, error: "Failed to check crew report status" };
  }
}
