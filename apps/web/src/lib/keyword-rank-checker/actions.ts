"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitKeywordRankCheck } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateKeywordRankInput } from "./validation";

export type KeywordRankActionState = {
  status: "idle" | "error";
  errors?: {
    domain?: string[];
    keyword?: string[];
    locale?: string[];
    form?: string[];
  };
};

export async function startKeywordRankCheckAction(
  _prevState: KeywordRankActionState,
  formData: FormData
): Promise<KeywordRankActionState> {
  const validated = validateKeywordRankInput({
    domain: formData.get("domain")?.toString() ?? "",
    keyword: formData.get("keyword")?.toString() ?? "",
    locale: formData.get("locale")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { domain, keyword, locale } = validated.data;

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the existing system-error contract
    // instead of an unhandled 500.
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a keyword rank check");
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

    // Inserts the job_records row (queue_name 'keyword_rank_audit', status
    // 'queued') and enqueues the BullMQ job consumed by the keyword rank worker.
    const result = await submitKeywordRankCheck({ db, redisUrl, domain, keyword, locale });

    return redirect(`/tools/keyword-rank-checker/result/${result.jobId}`);
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
    console.error("Keyword rank check start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
