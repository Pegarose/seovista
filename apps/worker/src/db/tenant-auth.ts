import type { DbClient } from "./client.js";

// ---------------------------------------------------------------------------
// Frozen authorization decision vocabulary
// ---------------------------------------------------------------------------
export type AuthorizationDecision =
  | "allow"
  | "read_only"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "ownership_invalid";

// ---------------------------------------------------------------------------
// Tri-state project ownership result used internally by the authorization
// repository to distinguish a genuinely missing project from a project that
// exists but belongs to a foreign workspace or organization.
// ---------------------------------------------------------------------------
export type ProjectOwnershipResult = "owned" | "not_found" | "ownership_invalid";

// ---------------------------------------------------------------------------
// Membership roles — documented capability bundles
// ---------------------------------------------------------------------------
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

// ---------------------------------------------------------------------------
// Named capabilities checked by the authorization seam
// ---------------------------------------------------------------------------
export type Capability =
  | "keywords:read"
  | "keywords:write"
  | "keywords:research"
  | "cms:read"
  | "cms:write"
  | "cms:analyze"
  | "cms:publish"
  | "monitoring:read"
  | "monitoring:write"
  | "bulk:write"
  | "citations:read"
  | "citations:write";

// ---------------------------------------------------------------------------
// Input context for the single workspace-aware authorization seam
// ---------------------------------------------------------------------------
export interface AuthorizationContext {
  /** Authenticated user ID, or null for unauthenticated. */
  principalId: string | null;
  /** Organization ID claimed by the request. */
  organizationId: string;
  /** Workspace ID claimed by the request. */
  workspaceId: string;
  /** Project ID optionally claimed by the request. */
  projectId: string | null;
  /** The capability needed for the requested operation. */
  capability: Capability;
  /** Human-readable operation label for audit/debug purposes. */
  operation: string;
}

// ---------------------------------------------------------------------------
// Membership record resolved from the database
// ---------------------------------------------------------------------------
export interface WorkspaceMembership {
  userId: string;
  workspaceId: string;
  organizationId: string;
  role: WorkspaceRole;
}

// ---------------------------------------------------------------------------
// Capability → required minimum role matrix.
// Owners and admins always have every capability.
// Editors need explicit grant for write/research/publish/bulk operations.
// Viewers are read-only for keyword, CMS, monitoring, and citations;
// they are denied for write/research/publish/bulk.
// ---------------------------------------------------------------------------
const CAPABILITY_ROLE_MATRIX: Record<Capability, WorkspaceRole[]> = {
  "keywords:read": ["owner", "admin", "editor", "viewer"],
  "keywords:write": ["owner", "admin", "editor"],
  "keywords:research": ["owner", "admin", "editor"],
  "cms:read": ["owner", "admin", "editor", "viewer"],
  "cms:write": ["owner", "admin", "editor"],
  "cms:analyze": ["owner", "admin", "editor"],
  "cms:publish": ["owner", "admin"],
  "monitoring:read": ["owner", "admin", "editor", "viewer"],
  "monitoring:write": ["owner", "admin", "editor"],
  "bulk:write": ["owner", "admin", "editor"],
  "citations:read": ["owner", "admin", "editor", "viewer"],
  "citations:write": ["owner", "admin", "editor"],
};

// ---------------------------------------------------------------------------
// Role ordering for comparison (owner > admin > editor > viewer)
// ---------------------------------------------------------------------------
const ROLE_ORDER: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

// ---------------------------------------------------------------------------
// Authorization repository — resolves membership and project ownership
// ---------------------------------------------------------------------------
export interface AuthorizationRepository {
  /** Resolve the membership for a principal in a workspace. */
  getMembership(
    principalId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;

  /**
   * Check project ownership with a tri-state result that distinguishes a
   * genuinely missing project from a project that exists in a foreign
   * workspace or organization.
   *
   * - `owned` — project exists and belongs to this workspace/org
   * - `not_found` — project does not exist at all
   * - `ownership_invalid` — project exists but in a different workspace/org
   */
  checkProjectOwnership(
    projectId: string,
    workspaceId: string,
    organizationId: string,
  ): Promise<ProjectOwnershipResult>;
}

// ---------------------------------------------------------------------------
// Create the repository implementation backed by a DbClient
// ---------------------------------------------------------------------------
export function createAuthorizationRepository(
  client: DbClient,
): AuthorizationRepository {
  return {
    async getMembership(
      principalId: string,
      workspaceId: string,
    ): Promise<WorkspaceMembership | null> {
      const result = await client.query<{
        user_id: string;
        workspace_id: string;
        organization_id: string;
        role: WorkspaceRole;
      }>(
        `SELECT user_id, workspace_id, organization_id, role
         FROM workspace_memberships
         WHERE user_id = $1 AND workspace_id = $2`,
        [principalId, workspaceId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        userId: row.user_id,
        workspaceId: row.workspace_id,
        organizationId: row.organization_id,
        role: row.role,
      };
    },

    async checkProjectOwnership(
      projectId: string,
      workspaceId: string,
      organizationId: string,
    ): Promise<ProjectOwnershipResult> {
      // First query: does the project exist at all?
      const existResult = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1) AS exists`,
        [projectId],
      );
      if (!existResult.rows[0]?.exists) {
        return "not_found";
      }

      // Project exists — check workspace/org ownership
      const ownershipResult = await client.query<{ owned: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM projects
           WHERE id = $1
             AND workspace_id = $2
             AND organization_id = $3
         ) AS owned`,
        [projectId, workspaceId, organizationId],
      );
      return ownershipResult.rows[0]?.owned ? "owned" : "ownership_invalid";
    },
  };
}

// ---------------------------------------------------------------------------
// The single workspace-aware authorization decision seam.
//
// Evaluates (principalId, organizationId, workspaceId, projectId, capability,
// operation) against the membership model and returns a typed decision.
//
// Decision order:
//   1. unauthenticated  – no principal
//   2. forbidden         – no membership in workspace
//   3. ownership_invalid – workspace/org mismatch or project not in workspace
//   4. not_found         – project doesn't exist (separate from ownership)
//   5. read_only         – viewer trying write/research/publish/bulk
//   6. allow             – role has the required capability
// ---------------------------------------------------------------------------
export async function evaluateAuthorization(
  ctx: AuthorizationContext,
  repo: AuthorizationRepository,
): Promise<AuthorizationDecision> {
  // 1. Unauthenticated
  if (ctx.principalId === null) {
    return "unauthenticated";
  }

  // 2. Resolve membership
  const membership = await repo.getMembership(
    ctx.principalId,
    ctx.workspaceId,
  );

  if (!membership) {
    return "forbidden";
  }

  // 3. Verify workspace → organization alignment
  if (membership.organizationId !== ctx.organizationId) {
    return "ownership_invalid";
  }

  // 4. If a project is specified, verify it belongs to this workspace/org
  if (ctx.projectId !== null) {
    const ownership = await repo.checkProjectOwnership(
      ctx.projectId,
      ctx.workspaceId,
      ctx.organizationId,
    );
    if (ownership === "not_found") {
      return "not_found";
    }
    if (ownership === "ownership_invalid") {
      return "ownership_invalid";
    }
    // ownership === "owned" — project exists and belongs to this workspace/org
  }

  // 5. Check capability against role
  const allowedRoles = CAPABILITY_ROLE_MATRIX[ctx.capability];
  if (!allowedRoles.includes(membership.role)) {
    // Viewer gets read_only for write/research/publish/bulk attempts;
    // all others get forbidden for capability they lack.
    if (membership.role === "viewer") {
      return "read_only";
    }
    return "forbidden";
  }

  // 6. Allow
  return "allow";
}

// ---------------------------------------------------------------------------
// Pure helpers (no database) for capability checks
// ---------------------------------------------------------------------------

/** Return true when the decision permits the operation. */
export function isAllowed(decision: AuthorizationDecision): boolean {
  return decision === "allow";
}

/** Return true when the decision permits read access (allow or read_only). */
export function canRead(decision: AuthorizationDecision): boolean {
  return decision === "allow" || decision === "read_only";
}

/** Return the minimum role required for a capability. */
export function minimumRoleForCapability(
  capability: Capability,
): WorkspaceRole {
  const roles = CAPABILITY_ROLE_MATRIX[capability];
  // sorted ascending: viewer < editor < admin < owner
  return roles.reduce((min, r) =>
    ROLE_ORDER[r] < ROLE_ORDER[min] ? r : min,
  );
}

/** Return true when `role` satisfies the minimum for `capability`. */
export function roleHasCapability(
  role: WorkspaceRole,
  capability: Capability,
): boolean {
  const minRole = minimumRoleForCapability(capability);
  return ROLE_ORDER[role] >= ROLE_ORDER[minRole];
}

/** Exported for test assertions. */
export { CAPABILITY_ROLE_MATRIX, ROLE_ORDER };
