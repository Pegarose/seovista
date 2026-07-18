import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminAuthRepository, type AdminUser } from "@seovista/worker";
import { getAdminDb } from "./db";
import { hashSessionToken, verifyPassword } from "./password";

export const SESSION_COOKIE_NAME = "seovista_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function toSessionUser(user: AdminUser): SessionUser {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

export async function startAdminSession(userId: string, now = new Date()): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await createAdminAuthRepository(getAdminDb()).createSession({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });
}

export async function getCurrentAdminUser(now = new Date()): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await createAdminAuthRepository(getAdminDb()).findActiveSessionByHash(hashSessionToken(token), now);
  if (!session) {
    (await cookies()).delete(SESSION_COOKIE_NAME);
    return null;
  }
  return toSessionUser(session.user);
}

export async function requireAdminUser(now = new Date()): Promise<SessionUser> {
  const user = await getCurrentAdminUser(now);
  if (!user) throw new AuthenticationRequiredError();
  return user;
}

export async function revokeCurrentAdminSession(now = new Date()): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await createAdminAuthRepository(getAdminDb()).revokeSessionByHash(hashSessionToken(token), now);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function authenticateAdmin(email: string, password: string): Promise<SessionUser | null> {
  const repository = createAdminAuthRepository(getAdminDb());
  const user = await repository.findUserByEmail(email);
  if (!user || user.status !== "active") return null;

  const passwordResult = await getAdminDb().query<{ password_hash: string }>(
    "SELECT password_hash FROM admin_users WHERE id = $1 AND status = 'active'",
    [user.id]
  );
  const hash = passwordResult.rows[0]?.password_hash;
  if (!hash || !verifyPassword(password, hash)) return null;

  await startAdminSession(user.id);
  return toSessionUser(user);
}
