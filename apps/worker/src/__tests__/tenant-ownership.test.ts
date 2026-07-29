import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { setupTestEnvironment } from "./helpers/test-env.js";
import type { TestEnvironment } from "./helpers/test-env.js";
import { createTenantRepository } from "../db/tenant.js";
import {
  createAuthorizationRepository,
  evaluateAuthorization,
  type AuthorizationContext,
  type AuthorizationDecision,
  type WorkspaceRole,
  type Capability,
} from "../db/tenant-auth.js";
import { createAdminAuthRepository } from "../db/admin-auth.js";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// VAL-FOUND-002 — Workspace and project boundaries are enforced
// VAL-FOUND-009 — Workspace-aware authorization seam
// VAL-FOUND-010 — Composite workspace/project ownership integrity
// VAL-FOUND-014 — Domain invariants reject invalid states
// VAL-FOUND-017 — Membership roles and capabilities map to ownership scope
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

describe("Tenant Ownership and Authorization", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 90_000);

  afterAll(async () => {
    await env.cleanup();
  }, 90_000);

  // ------------------------------------------------------------------
  // VAL-FOUND-002: Workspace and project boundaries
  // ------------------------------------------------------------------
  describe("VAL-FOUND-002 — Workspace and project boundaries", () => {
    it("rejects cross-workspace project reads", async () => {
      const tenant = createTenantRepository(env.db);
      const orgA = await tenant.createOrganization("Org A");
      const orgB = await tenant.createOrganization("Org B");
      const wsA = await tenant.createWorkspace(orgA.id, "Workspace A");
      const wsB = await tenant.createWorkspace(orgB.id, "Workspace B");
      const projA = await tenant.createProject(wsA.id, orgA.id, "Project A");

      // Project A belongs to workspace A — validate with workspace B should fail
      const ownedByA = await tenant.validateProjectOwnership(projA.id, wsA.id, orgA.id);
      const notOwnedByB = await tenant.validateProjectOwnership(projA.id, wsB.id, orgB.id);

      expect(ownedByA).toBe(true);
      expect(notOwnedByB).toBe(false);
    });

    it("prevents creating a project with mismatched workspace and organization", async () => {
      const tenant = createTenantRepository(env.db);
      const orgA = await tenant.createOrganization("Org A2");
      const orgB = await tenant.createOrganization("Org B2");
      const wsA = await tenant.createWorkspace(orgA.id, "Workspace A2");

      // Try to create a project with workspace A but organization B
      // The composite FK should reject this
      await expect(
        tenant.createProject(wsA.id, orgB.id, "Invalid Project"),
      ).rejects.toThrow();
    });

    it("prevents adding a member with mismatched workspace and org", async () => {
      const tenant = createTenantRepository(env.db);
      const auth = createAdminAuthRepository(env.db);
      const orgA = await tenant.createOrganization("Org A3");
      const orgB = await tenant.createOrganization("Org B3");
      const wsA = await tenant.createWorkspace(orgA.id, "Workspace A3");

      const user = await auth.createUser({
        email: `user-${env.projectId}@test.local`,
        displayName: "Test User",
        passwordHash: hashPassword("test"),
      });

      // Should fail because workspace A belongs to org A, not org B
      await expect(
        tenant.addMember(user.id, wsA.id, orgB.id, "editor"),
      ).rejects.toThrow();
    });

    it("enforces unique membership per user per workspace", async () => {
      const tenant = createTenantRepository(env.db);
      const auth = createAdminAuthRepository(env.db);
      const org = await tenant.createOrganization("Org A4");
      const ws = await tenant.createWorkspace(org.id, "Workspace A4");

      const user = await auth.createUser({
        email: `user2-${env.projectId}@test.local`,
        displayName: "Test User 2",
        passwordHash: hashPassword("test"),
      });

      // First membership
      await tenant.addMember(user.id, ws.id, org.id, "editor");

      // Second attempt should upsert (ON CONFLICT DO UPDATE), not create duplicate
      const membership = await tenant.addMember(user.id, ws.id, org.id, "viewer");
      expect(membership.role).toBe("viewer");

      // Verify only one membership row exists
      const memberships = await tenant.listMembershipsByWorkspace(ws.id);
      const userMemberships = memberships.filter((m) => m.user_id === user.id);
      expect(userMemberships).toHaveLength(1);
    });

    it("enforces unique project name per workspace", async () => {
      const tenant = createTenantRepository(env.db);
      const org = await tenant.createOrganization("Org A5");
      const ws = await tenant.createWorkspace(org.id, "Workspace A5");

      await tenant.createProject(ws.id, org.id, "Unique Project");
      await expect(
        tenant.createProject(ws.id, org.id, "Unique Project"),
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------
  // VAL-FOUND-009 & VAL-FOUND-017: Authorization seam
  // ------------------------------------------------------------------
  describe("VAL-FOUND-009/017 — Authorization seam and capability matrix", () => {
    async function createUserWithRole(
      tenant: ReturnType<typeof createTenantRepository>,
      auth: ReturnType<typeof createAdminAuthRepository>,
      orgId: string,
      wsId: string,
      emailSuffix: string,
      role: WorkspaceRole,
    ): Promise<string> {
      const user = await auth.createUser({
        email: `${emailSuffix}-${env.projectId}@test.local`,
        displayName: `User ${role}`,
        passwordHash: hashPassword("test"),
      });
      await tenant.addMember(user.id, wsId, orgId, role);
      return user.id;
    }

    async function assertAuthorization(
      ctx: AuthorizationContext,
      expected: AuthorizationDecision,
    ): Promise<void> {
      const repo = createAuthorizationRepository(env.db);
      const decision = await evaluateAuthorization(ctx, repo);
      expect(decision).toBe(expected);
    }

    let orgId: string;
    let wsId: string;
    let projectId: string;
    let ownerId: string;
    let adminId: string;
    let editorId: string;
    let viewerId: string;
    let foreignOrgId: string;
    let foreignWsId: string;

    beforeAll(async () => {
      const tenant = createTenantRepository(env.db);
      const auth = createAdminAuthRepository(env.db);

      const org = await tenant.createOrganization("Auth Org");
      orgId = org.id;
      const foreignOrg = await tenant.createOrganization("Foreign Org");
      foreignOrgId = foreignOrg.id;

      const ws = await tenant.createWorkspace(orgId, "Auth Workspace");
      wsId = ws.id;
      const foreignWs = await tenant.createWorkspace(foreignOrgId, "Foreign Workspace");
      foreignWsId = foreignWs.id;

      const project = await tenant.createProject(wsId, orgId, "Auth Project");
      projectId = project.id;

      ownerId = await createUserWithRole(tenant, auth, orgId, wsId, "owner", "owner");
      adminId = await createUserWithRole(tenant, auth, orgId, wsId, "admin", "admin");
      editorId = await createUserWithRole(tenant, auth, orgId, wsId, "editor", "editor");
      viewerId = await createUserWithRole(tenant, auth, orgId, wsId, "viewer", "viewer");
    }, 90_000);

    function ctx(
      principalId: string | null,
      capability: Capability,
      project: boolean = true,
    ): AuthorizationContext {
      return {
        principalId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: project ? projectId : null,
        capability,
        operation: "test",
      };
    }

    function foreignCtx(
      principalId: string | null,
      capability: Capability,
    ): AuthorizationContext {
      return {
        principalId,
        organizationId: foreignOrgId,
        workspaceId: foreignWsId,
        projectId: null,
        capability,
        operation: "test",
      };
    }

    // ------ Unauthenticated ------
    it("returns unauthenticated for null principal", async () => {
      await assertAuthorization(ctx(null, "keywords:read"), "unauthenticated");
      await assertAuthorization(ctx(null, "cms:write"), "unauthenticated");
    });

    // ------ Non-member / foreign workspace ------
    it("returns forbidden for non-member principal", async () => {
      const auth = createAdminAuthRepository(env.db);
      const outsider = await auth.createUser({
        email: `outsider-${env.projectId}@test.local`,
        displayName: "Outsider",
        passwordHash: hashPassword("test"),
      });
      await assertAuthorization(ctx(outsider.id, "keywords:read"), "forbidden");
    });

    it("returns forbidden for foreign workspace member", async () => {
      // Owner of our workspace trying to access foreign workspace
      await assertAuthorization(foreignCtx(ownerId, "keywords:read"), "forbidden");
    });

    // ------ Ownership invalid ------
    it("returns ownership_invalid for mismatched project", async () => {
      const tenant = createTenantRepository(env.db);
      // Create a project in the foreign workspace
      const foreignProject = await tenant.createProject(foreignWsId, foreignOrgId, "Foreign Project");

      const ctx: AuthorizationContext = {
        principalId: ownerId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: foreignProject.id, // foreign project with our workspace
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctx, "ownership_invalid");
    });

    // ------ Owner capabilities ------
    it("allows owner all capabilities", async () => {
      for (const cap of [
        "keywords:read", "keywords:write", "keywords:research",
        "cms:read", "cms:write", "cms:analyze", "cms:publish",
        "monitoring:read", "monitoring:write", "bulk:write",
        "citations:read", "citations:write",
      ] as Capability[]) {
        await assertAuthorization(ctx(ownerId, cap), "allow");
      }
    });

    // ------ Admin capabilities ------
    it("allows admin read/write/research and publish (owner/admin scope)", async () => {
      await assertAuthorization(ctx(adminId, "keywords:read"), "allow");
      await assertAuthorization(ctx(adminId, "keywords:write"), "allow");
      await assertAuthorization(ctx(adminId, "cms:read"), "allow");
      await assertAuthorization(ctx(adminId, "cms:write"), "allow");
      // Admin is in the cms:publish role list (owner + admin)
      await assertAuthorization(ctx(adminId, "cms:publish"), "allow");
    });

    // ------ Editor capabilities ------
    it("allows editor read and edit but not publish or research", async () => {
      await assertAuthorization(ctx(editorId, "keywords:read"), "allow");
      await assertAuthorization(ctx(editorId, "cms:read"), "allow");
      await assertAuthorization(ctx(editorId, "cms:write"), "allow");
      // Editor should not have publish
      await assertAuthorization(ctx(editorId, "cms:publish"), "forbidden");
      // Editor should not have research
      await assertAuthorization(ctx(editorId, "keywords:research"), "allow");
    });

    // ------ Viewer capabilities ------
    it("gives viewer read_only for write operations", async () => {
      await assertAuthorization(ctx(viewerId, "keywords:read"), "allow");
      await assertAuthorization(ctx(viewerId, "cms:read"), "allow");
      await assertAuthorization(ctx(viewerId, "monitoring:read"), "allow");
      await assertAuthorization(ctx(viewerId, "citations:read"), "allow");

      await assertAuthorization(ctx(viewerId, "keywords:write"), "read_only");
      await assertAuthorization(ctx(viewerId, "cms:write"), "read_only");
      await assertAuthorization(ctx(viewerId, "bulk:write"), "read_only");
      await assertAuthorization(ctx(viewerId, "cms:publish"), "read_only");
    });

    // ------ Role has capability helper ------
    it("roleHasCapability matches matrix", async () => {
      const { roleHasCapability } = await import("../db/tenant-auth.js");
      expect(roleHasCapability("owner", "cms:publish")).toBe(true);
      expect(roleHasCapability("admin", "cms:publish")).toBe(true);
      expect(roleHasCapability("editor", "cms:write")).toBe(true);
      expect(roleHasCapability("viewer", "cms:write")).toBe(false);
      expect(roleHasCapability("viewer", "keywords:read")).toBe(true);
    });

    // ------ VAL-FOUND-009: not_found vs ownership_invalid distinction ------
    it("returns not_found for a genuinely non-existent project", async () => {
      const nonExistentId = "11111111-1111-1111-1111-111111111111";
      const ctx: AuthorizationContext = {
        principalId: ownerId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: nonExistentId,
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctx, "not_found");
    });

    it("returns ownership_invalid for a project that exists in a foreign workspace", async () => {
      const tenant = createTenantRepository(env.db);
      // Create a project that genuinely exists but in the foreign workspace
      const foreignProject = await tenant.createProject(foreignWsId, foreignOrgId, "Foreign Owned Project");

      const ctx: AuthorizationContext = {
        principalId: ownerId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: foreignProject.id, // exists, but in foreign workspace
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctx, "ownership_invalid");
    });

    it("owned project continues through capability matrix to allow", async () => {
      // Owner with owned project should get allow for read
      const ctx: AuthorizationContext = {
        principalId: ownerId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: projectId,
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctx, "allow");
    });

    it("owned project with insufficient capability returns forbidden", async () => {
      // Editor trying cms:publish on owned project should get forbidden
      const ctx: AuthorizationContext = {
        principalId: editorId,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: projectId,
        capability: "cms:publish",
        operation: "test",
      };
      await assertAuthorization(ctx, "forbidden");
    });

    it("non-member cannot discover project existence through not_found vs forbidden", async () => {
      const auth = createAdminAuthRepository(env.db);
      const outsider = await auth.createUser({
        email: `outsider2-${env.projectId}@test.local`,
        displayName: "Outsider 2",
        passwordHash: hashPassword("test"),
      });

      // Non-member accessing a non-existent project ID gets forbidden (membership fails first)
      const nonExistentId = "22222222-2222-2222-2222-222222222222";
      const ctxNonExistent: AuthorizationContext = {
        principalId: outsider.id,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: nonExistentId,
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctxNonExistent, "forbidden");

      // Non-member accessing an owned project also gets forbidden (membership fails first)
      const ctxOwned: AuthorizationContext = {
        principalId: outsider.id,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: projectId,
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctxOwned, "forbidden");
    });

    it("unauthenticated principal cannot reach resource lookup", async () => {
      const nonExistentId = "33333333-3333-3333-3333-333333333333";
      const ctx: AuthorizationContext = {
        principalId: null,
        organizationId: orgId,
        workspaceId: wsId,
        projectId: nonExistentId,
        capability: "keywords:read",
        operation: "test",
      };
      await assertAuthorization(ctx, "unauthenticated");
    });

    it("checkProjectOwnership returns not_found for non-existent project", async () => {
      const repo = createAuthorizationRepository(env.db);
      const nonExistentId = "44444444-4444-4444-4444-444444444444";
      const result = await repo.checkProjectOwnership(nonExistentId, wsId, orgId);
      expect(result).toBe("not_found");
    });

    it("checkProjectOwnership returns owned for owned project", async () => {
      const repo = createAuthorizationRepository(env.db);
      const result = await repo.checkProjectOwnership(projectId, wsId, orgId);
      expect(result).toBe("owned");
    });

    it("checkProjectOwnership returns ownership_invalid for foreign-workspace project", async () => {
      const tenant = createTenantRepository(env.db);
      const foreignProject = await tenant.createProject(foreignWsId, foreignOrgId, "Check Ownership Project");
      const repo = createAuthorizationRepository(env.db);
      const result = await repo.checkProjectOwnership(foreignProject.id, wsId, orgId);
      expect(result).toBe("ownership_invalid");
    });
  });

  // ------------------------------------------------------------------
  // VAL-FOUND-010: Composite ownership integrity
  // ------------------------------------------------------------------
  describe("VAL-FOUND-010 — Composite ownership rejects orphan/mismatched rows", () => {
    it("rejects project creation with non-existent workspace", async () => {
      const tenant = createTenantRepository(env.db);
      const org = await tenant.createOrganization("Ownership Org");
      const fakeWsId = "00000000-0000-0000-0000-000000000000";

      await expect(
        tenant.createProject(fakeWsId, org.id, "Orphan Project"),
      ).rejects.toThrow();
    });

    it("rejects project creation with non-existent organization", async () => {
      const tenant = createTenantRepository(env.db);
      const org = await tenant.createOrganization("Ownership Org 2");
      const ws = await tenant.createWorkspace(org.id, "Ownership Workspace");
      const fakeOrgId = "00000000-0000-0000-0000-000000000000";

      await expect(
        tenant.createProject(ws.id, fakeOrgId, "Orphan Project"),
      ).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------
  // VAL-FOUND-014: Domain invariants reject invalid states
  // ------------------------------------------------------------------
  describe("VAL-FOUND-014 — Domain invariants", () => {
    it("rejects blank workspace or project names", async () => {
      const tenant = createTenantRepository(env.db);
      const org = await tenant.createOrganization("Invariants Org");

      await expect(
        tenant.createWorkspace(org.id, ""),
      ).rejects.toThrow();

      const ws = await tenant.createWorkspace(org.id, "Valid Workspace");
      await expect(
        tenant.createProject(ws.id, org.id, ""),
      ).rejects.toThrow();
    });

    it("rejects invalid membership role", async () => {
      const tenant = createTenantRepository(env.db);
      const auth = createAdminAuthRepository(env.db);
      const org = await tenant.createOrganization("Role Org");
      const ws = await tenant.createWorkspace(org.id, "Role Workspace");
      const user = await auth.createUser({
        email: `role-${env.projectId}@test.local`,
        displayName: "Role User",
        passwordHash: hashPassword("test"),
      });

      // The CHECK constraint on workspace_memberships.role should reject 'superadmin'
      await expect(
        tenant.addMember(user.id, ws.id, org.id, "superadmin" as WorkspaceRole),
      ).rejects.toThrow();
    });

    it("enforces unique workspace name per organization", async () => {
      const tenant = createTenantRepository(env.db);
      const org = await tenant.createOrganization("Uniq Org");

      await tenant.createWorkspace(org.id, "My Workspace");
      await expect(
        tenant.createWorkspace(org.id, "My Workspace"),
      ).rejects.toThrow();
    });

    it("allows same workspace name in different organizations", async () => {
      const tenant = createTenantRepository(env.db);
      const orgA = await tenant.createOrganization("Uniq Org A");
      const orgB = await tenant.createOrganization("Uniq Org B");

      await tenant.createWorkspace(orgA.id, "Shared Name");
      const wsB = await tenant.createWorkspace(orgB.id, "Shared Name");
      expect(wsB.name).toBe("Shared Name");
    });
  });
});
