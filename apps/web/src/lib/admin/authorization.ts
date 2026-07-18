import "server-only";

import { createRbacRepository } from "@seovista/worker";
import { getAdminDb } from "./db";
import type { SessionUser } from "./session";

export const ADMIN_PERMISSIONS = {
  overviewRead: "admin:overview:read",
} as const;

export class AdminForbiddenError extends Error {
  constructor() {
    super("Admin permission required");
    this.name = "AdminForbiddenError";
  }
}

export async function hasAdminPermission(subjectIdentity: string, permissionIdentity: string): Promise<boolean> {
  return createRbacRepository(getAdminDb()).subjectHasPermission(subjectIdentity, permissionIdentity);
}

export async function requireAdminPermission(user: SessionUser, permissionIdentity: string): Promise<void> {
  if (!(await hasAdminPermission(user.id, permissionIdentity))) {
    throw new AdminForbiddenError();
  }
}
