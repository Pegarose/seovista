import type { DbClient } from "./client.js";
import type { WorkspaceRole } from "./tenant-auth.js";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  created_at: Date;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceMembership {
  user_id: string;
  workspace_id: string;
  organization_id: string;
  role: WorkspaceRole;
  created_at: Date;
}

export interface Project {
  id: string;
  workspace_id: string;
  organization_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface TenantRepository {
  // Organizations
  createOrganization(name: string): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;

  // Workspaces
  createWorkspace(organizationId: string, name: string): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspacesByOrganization(organizationId: string): Promise<Workspace[]>;

  // Memberships
  addMember(
    userId: string,
    workspaceId: string,
    organizationId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMembership>;
  getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
  listMembershipsByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;
  updateMemberRole(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMembership>;
  removeMember(userId: string, workspaceId: string): Promise<void>;

  // Projects
  createProject(
    workspaceId: string,
    organizationId: string,
    name: string,
  ): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjectsByWorkspace(workspaceId: string): Promise<Project[]>;
  validateProjectOwnership(
    projectId: string,
    workspaceId: string,
    organizationId: string,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTenantRepository(client: DbClient): TenantRepository {
  return {
    // -- Organizations -------------------------------------------------------
    async createOrganization(name: string): Promise<Organization> {
      const result = await client.query<Organization>(
        `INSERT INTO admin_organizations (name) VALUES ($1) RETURNING *`,
        [name.trim()],
      );
      return result.rows[0]!;
    },

    async getOrganization(id: string): Promise<Organization | null> {
      const result = await client.query<Organization>(
        `SELECT * FROM admin_organizations WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    // -- Workspaces ----------------------------------------------------------
    async createWorkspace(
      organizationId: string,
      name: string,
    ): Promise<Workspace> {
      const result = await client.query<Workspace>(
        `INSERT INTO workspaces (organization_id, name)
         VALUES ($1, $2) RETURNING *`,
        [organizationId, name.trim()],
      );
      return result.rows[0]!;
    },

    async getWorkspace(id: string): Promise<Workspace | null> {
      const result = await client.query<Workspace>(
        `SELECT * FROM workspaces WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async listWorkspacesByOrganization(
      organizationId: string,
    ): Promise<Workspace[]> {
      const result = await client.query<Workspace>(
        `SELECT * FROM workspaces WHERE organization_id = $1 ORDER BY name`,
        [organizationId],
      );
      return result.rows;
    },

    // -- Memberships ---------------------------------------------------------
    async addMember(
      userId: string,
      workspaceId: string,
      organizationId: string,
      role: WorkspaceRole,
    ): Promise<WorkspaceMembership> {
      const result = await client.query<WorkspaceMembership>(
        `INSERT INTO workspace_memberships (user_id, workspace_id, organization_id, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = $4
         RETURNING *`,
        [userId, workspaceId, organizationId, role],
      );
      return result.rows[0]!;
    },

    async getMembership(
      userId: string,
      workspaceId: string,
    ): Promise<WorkspaceMembership | null> {
      const result = await client.query<WorkspaceMembership>(
        `SELECT * FROM workspace_memberships
         WHERE user_id = $1 AND workspace_id = $2`,
        [userId, workspaceId],
      );
      return result.rows[0] ?? null;
    },

    async listMembershipsByWorkspace(
      workspaceId: string,
    ): Promise<WorkspaceMembership[]> {
      const result = await client.query<WorkspaceMembership>(
        `SELECT * FROM workspace_memberships WHERE workspace_id = $1`,
        [workspaceId],
      );
      return result.rows;
    },

    async updateMemberRole(
      userId: string,
      workspaceId: string,
      role: WorkspaceRole,
    ): Promise<WorkspaceMembership> {
      const result = await client.query<WorkspaceMembership>(
        `UPDATE workspace_memberships SET role = $3
         WHERE user_id = $1 AND workspace_id = $2
         RETURNING *`,
        [userId, workspaceId, role],
      );
      if (result.rows.length === 0) {
        throw new Error(
          `Membership not found: user=${userId}, workspace=${workspaceId}`,
        );
      }
      return result.rows[0]!;
    },

    async removeMember(
      userId: string,
      workspaceId: string,
    ): Promise<void> {
      await client.query(
        `DELETE FROM workspace_memberships
         WHERE user_id = $1 AND workspace_id = $2`,
        [userId, workspaceId],
      );
    },

    // -- Projects ------------------------------------------------------------
    async createProject(
      workspaceId: string,
      organizationId: string,
      name: string,
    ): Promise<Project> {
      const result = await client.query<Project>(
        `INSERT INTO projects (workspace_id, organization_id, name)
         VALUES ($1, $2, $3) RETURNING *`,
        [workspaceId, organizationId, name.trim()],
      );
      return result.rows[0]!;
    },

    async getProject(id: string): Promise<Project | null> {
      const result = await client.query<Project>(
        `SELECT * FROM projects WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async listProjectsByWorkspace(
      workspaceId: string,
    ): Promise<Project[]> {
      const result = await client.query<Project>(
        `SELECT * FROM projects WHERE workspace_id = $1 ORDER BY name`,
        [workspaceId],
      );
      return result.rows;
    },

    async validateProjectOwnership(
      projectId: string,
      workspaceId: string,
      organizationId: string,
    ): Promise<boolean> {
      const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM projects
           WHERE id = $1
             AND workspace_id = $2
             AND organization_id = $3
         ) AS exists`,
        [projectId, workspaceId, organizationId],
      );
      return result.rows[0]?.exists ?? false;
    },
  };
}
