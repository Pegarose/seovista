"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitAiCrawlerAudit } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateAiCrawlerInput } from "./validation";

export type AiCrawlerActionState = {
  status: "idle" | "error" | "validating";
  errors?: {
    url?: string[];
    form?: string[];
  };
};

export async function startAiCrawlerAuditAction(
  _prevState: AiCrawlerActionState,
  formData: FormData
): Promise<AiCrawlerActionState> {
  const rawUrl = formData.get("url")?.toString() ?? "";
  const validated = validateAiCrawlerInput(rawUrl);

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
      throw new Error("REDIS_URL is required to submit an AI crawler audit");
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

    // Inserts the job_records row (queue_name 'ai_crawler_audit', status 'queued')
    // and enqueues the BullMQ job consumed by the AI crawler worker.
    const result = await submitAiCrawlerAudit({ db, redisUrl, url });

    return redirect(`/tools/ai-crawler-checker/result/${result.jobId}`);
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
    console.error("AI crawler audit start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
