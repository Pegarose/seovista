import type { DbClient } from "./client.js";

export interface Role {
  id: string;
  canonical_identity: string;
  display_name: string;
  description: string | null;
  created_at: Date;
}

export interface Permission {
  id: string;
  canonical_identity: string;
  display_name: string;
  description: string | null;
  created_at: Date;
}

export function createRbacRepository(client: DbClient) {
  return {
    async createRole(canonicalIdentity: string, displayName: string, description?: string): Promise<Role> {
      const result = await client.query<Role>(
        `
          INSERT INTO rbac_roles (canonical_identity, display_name, description)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [canonicalIdentity, displayName, description ?? null]
      );
      return result.rows[0]!;
    },

    async createPermission(
      canonicalIdentity: string,
      displayName: string,
      description?: string
    ): Promise<Permission> {
      const result = await client.query<Permission>(
        `
          INSERT INTO rbac_permissions (canonical_identity, display_name, description)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [canonicalIdentity, displayName, description ?? null]
      );
      return result.rows[0]!;
    },

    async grantPermission(roleId: string, permissionId: string): Promise<void> {
      await client.query(
        `
          INSERT INTO rbac_role_permissions (role_id, permission_id)
          VALUES ($1, $2)
        `,
        [roleId, permissionId]
      );
    },

    async assignRole(subjectIdentity: string, roleId: string): Promise<void> {
      await client.query(
        `
          INSERT INTO rbac_subject_roles (subject_identity, role_id)
          VALUES ($1, $2)
        `,
        [subjectIdentity, roleId]
      );
    },
  };
}
