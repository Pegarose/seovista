"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitAttributionTraceCheck } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateAttributionTraceInput } from "./validation";

export type AttributionTraceActionState = {
  status: "idle" | "error";
  errors?: {
    domain?: string[];
    answer?: string[];
    keyword?: string[];
    form?: string[];
  };
};

export async function startAttributionTraceAction(
  _prevState: AttributionTraceActionState,
  formData: FormData,
): Promise<AttributionTraceActionState> {
  const rawKeyword = formData.get("keyword")?.toString()?.trim();
  const validated = validateAttributionTraceInput({
    domain: formData.get("domain")?.toString() ?? "",
    answer: formData.get("answer")?.toString() ?? "",
    ...(rawKeyword ? { keyword: rawKeyword } : {}),
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { domain, answer, keyword } = validated.data;

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep inside try so the
    // catch below returns the existing system-error contract.
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit an attribution trace");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.AUDIT_PER_IP_RATE_LIMIT) || 10;

    const rateLimit = await checkIpRateLimit({ redisUrl, ip: clientIp, limit });
    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [`Saatlik audit limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
        },
      };
    }

    const result = await submitAttributionTraceCheck({ db, redisUrl, domain, answer, ...(keyword ? { keyword } : {}) });
    return redirect(`/tools/attribution-trace/result/${result.jobId}`);
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
    console.error("Attribution trace start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
