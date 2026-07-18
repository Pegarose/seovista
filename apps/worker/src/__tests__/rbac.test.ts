import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createRbacRepository } from "../db/rbac.js";
import { setupTestEnvironment } from "./helpers/test-env.js";
import type { TestEnvironment } from "./helpers/test-env.js";

describe("admin RBAC", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 90_000);

  afterAll(async () => {
    await env.cleanup();
  }, 90_000);

  it("allows a granted permission and denies an unrelated permission", async () => {
    const rbac = createRbacRepository(env.db);
    const role = await rbac.createRole(`operator-${env.projectId}`, "Operator");
    const allowed = await rbac.createPermission(`admin:overview:read:${env.projectId}`, "Overview");
    await rbac.grantPermission(role.id, allowed.id);
    await rbac.assignRole(`user-${env.projectId}`, role.id);

    expect(await rbac.subjectHasPermission(`user-${env.projectId}`, allowed.canonical_identity)).toBe(true);
    expect(await rbac.subjectHasPermission(`user-${env.projectId}`, "admin:settings:write")).toBe(false);
  });
});
