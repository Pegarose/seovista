import { hasAdminPermission, AdminForbiddenError } from "../admin/authorization";
import type { SessionUser } from "../admin/session";

export const CmsCapabilities = {
  Read: "content:read",
  Create: "content:create",
  Update: "content:revision:update",
  Preview: "content:preview",
  Publish: "content:publish",
  Unpublish: "content:unpublish",
  Archive: "content:archive",
  DeleteUnpublished: "content:delete:unpublished",
} as const;

export type CmsCapability = typeof CmsCapabilities[keyof typeof CmsCapabilities];

export async function requireCmsCapability(user: SessionUser, capability: CmsCapability): Promise<void> {
  const allowed = await hasAdminPermission(user.id, capability);
  if (!allowed) throw new AdminForbiddenError();
}
