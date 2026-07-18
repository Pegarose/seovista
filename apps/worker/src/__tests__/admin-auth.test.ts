import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminAuthRepository } from "../db/admin-auth.js";
import { setupTestEnvironment } from "./helpers/test-env.js";
import type { TestEnvironment } from "./helpers/test-env.js";

describe("admin authentication persistence", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 90_000);

  afterAll(async () => {
    await env.cleanup();
  }, 90_000);

  it("persists an admin user and resolves only an active session", async () => {
    const auth = createAdminAuthRepository(env.db);
    const user = await auth.createUser({
      email: `operator-${env.projectId}@seovista.test`,
      displayName: "SeoVista Operator",
      passwordHash: "opaque-password-hash",
      status: "active",
    });
    const session = await auth.createSession({
      userId: user.id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(session.user_id).toBe(user.id);
    expect((await auth.findActiveSessionByHash("a".repeat(64), new Date()))?.user_id).toBe(user.id);
    expect(
      await auth.findActiveSessionByHash("a".repeat(64), new Date(Date.now() + 120_000)),
    ).toBeNull();

    await auth.revokeSessionByHash("a".repeat(64), new Date());
    expect(await auth.findActiveSessionByHash("a".repeat(64), new Date())).toBeNull();
  });
});
