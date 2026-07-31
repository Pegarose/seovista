"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { randomUUID } from "node:crypto";

const SchemaInputSchema = z.object({
  url: z
    .string()
    .url("Geçerli bir URL giriniz.")
    .min(1, "URL alanının doldurulması zorunludur.")
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
      { message: "Geçersiz hedef. Dahili alan adları kabul edilmemektedir." }
    ),
});

export function validateSchemaInput(url: string) {
  return SchemaInputSchema.safeParse({ url });
}

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

    const jobId = randomUUID();
    await db.query(
      `INSERT INTO job_records (id, target, service, status, created_at, updated_at)
       VALUES ($1, $2, 'schema_audit', 'queued', NOW(), NOW())`,
      [jobId, url]
    );

    return redirect(`/tools/schema-checker/result/${jobId}`);
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
