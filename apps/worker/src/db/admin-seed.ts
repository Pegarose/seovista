import type { DbClient } from "./client.js";

export interface AdminBootstrapEnvironment {
  email?: string;
  displayName?: string;
  passwordHash?: string;
}

export async function ensureAdminBootstrap(
  client: DbClient,
  environment: AdminBootstrapEnvironment = {
    ...(process.env.SEOVISTA_ADMIN_EMAIL ? { email: process.env.SEOVISTA_ADMIN_EMAIL } : {}),
    ...(process.env.SEOVISTA_ADMIN_DISPLAY_NAME ? { displayName: process.env.SEOVISTA_ADMIN_DISPLAY_NAME } : {}),
    ...(process.env.SEOVISTA_ADMIN_PASSWORD_HASH
      ? { passwordHash: process.env.SEOVISTA_ADMIN_PASSWORD_HASH }
      : {}),
  },
): Promise<void> {
  if (!environment.email || !environment.passwordHash) return;

  const email = environment.email.trim().toLowerCase();
  const displayName = environment.displayName?.trim() || "SeoVista Operator";
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO admin_users (email, display_name, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (email) DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [email, displayName, environment.passwordHash],
  );
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Admin bootstrap user could not be resolved");

  await client.query(
    `
      INSERT INTO rbac_subject_roles (subject_identity, role_id)
      SELECT $1, id
      FROM rbac_roles
      WHERE canonical_identity = 'operator'
      ON CONFLICT (subject_identity, role_id) DO NOTHING
    `,
    [userId],
  );
}
