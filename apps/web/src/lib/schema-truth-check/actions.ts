"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitSchemaTruthCheck } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateSchemaTruthInput } from "./validation";

export type SchemaTruthActionState = {
  status: "idle" | "error";
  errors?: {
    url?: string[];
    form?: string[];
  };
};

export async function startSchemaTruthCheckAction(
  _prevState: SchemaTruthActionState,
  formData: FormData,
): Promise<SchemaTruthActionState> {
  const validated = validateSchemaTruthInput({
    url: formData.get("url")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { url } = validated.data;

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the existing system-error contract
    // instead of an unhandled 500.
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a schema truth check");
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

    // Inserts the job_records row (queue_name 'schema_truth_audit', status
    // 'queued') and enqueues the BullMQ job consumed by the schema truth worker.
    const result = await submitSchemaTruthCheck({ db, redisUrl, url });

    return redirect(`/tools/schema-truth-check/result/${result.jobId}`);
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
    console.error("Schema truth check start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
