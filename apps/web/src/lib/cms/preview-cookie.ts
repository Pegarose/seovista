import { cookies } from "next/headers";

export const PREVIEW_COOKIE_NAME = "seovista_preview_grant";

export async function setPreviewCookie(grantId: string, expiresAt: Date) {
  (await cookies()).set(PREVIEW_COOKIE_NAME, grantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPreviewCookie() {
  (await cookies()).delete(PREVIEW_COOKIE_NAME);
}

export async function getPreviewGrantContext(): Promise<string | null> {
  return (await cookies()).get(PREVIEW_COOKIE_NAME)?.value || null;
}
