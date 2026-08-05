"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, submitRenderParityCheck } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateRenderParityInput } from "./validation";

export type RenderParityActionState = {
  status: "idle" | "error";
  errors?: {
    url?: string[];
    form?: string[];
  };
};

export async function startRenderParityCheckAction(
  _prevState: RenderParityActionState,
  formData: FormData,
): Promise<RenderParityActionState> {
  const validated = validateRenderParityInput({
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
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required to submit a render parity check");
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

    const result = await submitRenderParityCheck({ db, redisUrl, url });
    return redirect(`/tools/render-parity-diff/result/${result.jobId}`);
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
    console.error("Render parity check start error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
