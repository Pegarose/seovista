"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitSchemaAudit } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateSchemaInput } from "./validation";

export type SchemaActionState = {
  status: "idle" | "error" | "validating";
  errors?: {
    url?: string[];
    form?: string[];
  };
};

export async function startSchemaAuditAction(
  _prevState: SchemaActionState,
  formData: FormData
): Promise<SchemaActionState> {
  const rawUrl = formData.get("url")?.toString() ?? "";
  const validated = validateSchemaInput(rawUrl);

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { url } = validated.data;
  const db = getAdminDb();

  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a schema audit");
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
          form: [`Saatlik audit limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
        },
      };
    }

    // Inserts the job_records row (queue_name 'schema_audit', status 'queued')
    // and enqueues the BullMQ job consumed by the schema worker.
    const result = await submitSchemaAudit({ db, redisUrl, url });

    return redirect(`/tools/schema-checker/result/${result.jobId}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("Schema audit start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
