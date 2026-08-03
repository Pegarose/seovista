"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations, type AlertSummary } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateTrackerTargetInput, validateTrackerSessionTargetInput } from "./validation";

export type TrackerTargetActionState = {
  status: "idle" | "error" | "success";
  token?: string;
  errors?: {
    email?: string[];
    keyword?: string[];
    domain?: string[];
    form?: string[];
  };
};

export async function createTrackerTargetAction(
  _prevState: TrackerTargetActionState,
  formData: FormData,
): Promise<TrackerTargetActionState> {
  const validated = validateTrackerTargetInput({
    email: formData.get("email")?.toString() ?? "",
    keyword: formData.get("keyword")?.toString() ?? "",
    domain: formData.get("domain")?.toString() ?? "",
    consent: formData.get("consent")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { email, keyword, domain, consent } = validated.data;

  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the documented system-error
    // contract instead of an unhandled 500.
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.TRACKER_PER_IP_RATE_LIMIT) || 3;

    const rateLimit = await checkIpRateLimit({
      redisUrl,
      ip: clientIp,
      limit,
      bucket: "tracker-create",
    });

    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [`Saatlik takip limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
        },
      };
    }

    const repo = createTrackerRepository(db);
    const session = await repo.findOrCreateSession(email, consent);

    const maxTargets = Number(process.env.TRACKER_MAX_TARGETS_PER_EMAIL) || 5;
    const currentCount = await repo.countActiveTargets(session.id);
    if (currentCount >= maxTargets) {
      return {
        status: "error",
        errors: {
          form: [`Bu e-posta için maksimum hedef sayısına (${maxTargets}) ulaştınız.`],
        },
      };
    }

    // The keyword_targets table has a UNIQUE(session_id, keyword, domain)
    // constraint; a duplicate insert surfaces as a PG unique violation (23505)
    // that we translate into the honest Turkish "already tracked" form error.
    // Every other error (e.g. a real database outage) is rethrown so the
    // outer catch returns the generic system-error contract instead of
    // misleading the user with a duplicate message.
    try {
      await repo.createTarget({
        sessionId: session.id,
        keyword,
        domain,
        locale: "tr-TR",
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return {
          status: "error",
          errors: {
            form: ["Bu anahtar kelime zaten takip ediliyor."],
          },
        };
      }
      throw error;
    }

    return { status: "success", token: session.token };
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
    console.error("Tracker target creation error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}

export type TrackerTargetsResult =
  | { success: true; targets: TargetWithObservations[]; email: string; consent: boolean }
  | { success: false; error: string };

export async function listTrackerTargetsAction(token: string): Promise<TrackerTargetsResult> {
  try {
    // getAdminDb() throws when DATABASE_URL is unset; keep the call inside
    // the try so the catch below returns the documented failure contract
    // instead of an unhandled 500.
    const db = getAdminDb();
    const repo = createTrackerRepository(db);

    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }

    const targets = await repo.listTargetsByToken(token);
    return { success: true, targets, email: session.email, consent: session.alert_consent };
  } catch (error) {
    console.error("Failed to list tracker targets:", error);
    return { success: false, error: "Takip paneli yüklenemedi." };
  }
}

export type AlertsResult =
  | { success: true; alerts: AlertSummary[] }
  | { success: false; error: string };

export async function listAlertsAction(token: string, limit = 30): Promise<AlertsResult> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const alerts = await repo.listAlertsByToken(token, limit);
    return { success: true, alerts };
  } catch (error) {
    console.error("Failed to list tracker alerts:", error);
    return { success: false, error: "Uyarılar yüklenemedi." };
  }
}

export async function deactivateTrackerTargetAction(
  token: string,
  targetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const result = await repo.deactivateTarget(token, targetId);
    if (!result) {
      return { success: false, error: "Hedef bulunamadı veya bu panel tarafından sahiplenilmiyor." };
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to deactivate tracker target:", error);
    return { success: false, error: "Hedef kaldırılamadı." };
  }
}

// --- B2: Session-based target creation (inline dashboard form) ---

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrackerSessionTargetActionState = {
  status: "idle" | "error" | "success";
  errors?: {
    keyword?: string[];
    domain?: string[];
    form?: string[];
  };
};

export async function createTrackerTargetForSessionAction(
  token: string,
  _prevState: TrackerSessionTargetActionState,
  formData: FormData,
): Promise<TrackerSessionTargetActionState> {
  const validated = validateTrackerSessionTargetInput({
    keyword: formData.get("keyword")?.toString() ?? "",
    domain: formData.get("domain")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { keyword, domain } = validated.data;

  try {
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.TRACKER_PER_IP_RATE_LIMIT) || 3;

    const rateLimit = await checkIpRateLimit({
      redisUrl,
      ip: clientIp,
      limit,
      bucket: "tracker-create",
    });

    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [`Saatlik takip limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
        },
      };
    }

    const repo = createTrackerRepository(db);

    // Defense in depth: the page already gates on UUID format, but this
    // action is called from a client island that receives the token as a prop.
    if (!TOKEN_RE.test(token)) {
      return {
        status: "error",
        errors: { form: ["Oturum bulunamadı."] },
      };
    }

    const session = await repo.findSessionByToken(token);
    if (!session) {
      return {
        status: "error",
        errors: { form: ["Oturum bulunamadı."] },
      };
    }

    const maxTargets = Number(process.env.TRACKER_MAX_TARGETS_PER_EMAIL) || 5;
    const currentCount = await repo.countActiveTargets(session.id);
    if (currentCount >= maxTargets) {
      return {
        status: "error",
        errors: {
          form: [`Bu panel için maksimum hedef sayısına (${maxTargets}) ulaştınız.`],
        },
      };
    }

    try {
      await repo.createTarget({
        sessionId: session.id,
        keyword,
        domain,
        locale: "tr-TR",
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return {
          status: "error",
          errors: {
            form: ["Bu anahtar kelime zaten takip ediliyor."],
          },
        };
      }
      throw error;
    }

    revalidatePath(`/tracker/${token}`);
    return { status: "success" };
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
    console.error("Tracker session target creation error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}

export async function updateAlertConsentAction(
  token: string,
  consent: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TOKEN_RE.test(token)) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    await repo.updateAlertConsent(session.id, consent);
    revalidatePath(`/tracker/${token}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update alert consent:", error);
    return { success: false, error: "E-posta uyarı tercihi güncellenemedi." };
  }
}
