import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ADMIN_DISPLAY_NAME,
  DEFAULT_ADMIN_EMAIL,
  ensureAdminBootstrap,
  runLocalAdminBootstrap,
  verifyAdminPasswordHash,
} from "../db/admin-seed.js";
import { setupTestEnvironment } from "./helpers/test-env.js";
import type { TestEnvironment } from "./helpers/test-env.js";

describe("local admin bootstrap", () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 90_000);

  afterAll(async () => {
    await env.cleanup();
  }, 90_000);

  it("does nothing when the password opt-in is absent", async () => {
    const createClient = vi.fn(() => {
      throw new Error("database must not be opened");
    });

    const result = await runLocalAdminBootstrap(
      { NODE_ENV: "development", DATABASE_URL: env.databaseUrl },
      { createClient },
    );

    expect(result.status).toBe("skipped");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects production and non-local connection targets", async () => {
    await expect(
      runLocalAdminBootstrap({
        NODE_ENV: "production",
        DATABASE_URL: "http://localhost:5432/seovista",
        SEOVISTA_ADMIN_PASSWORD: "local-only-secret",
      }),
    ).rejects.toThrow(/production/i);

    await expect(
      runLocalAdminBootstrap({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://remotehost:5432/seovista",
        SEOVISTA_ADMIN_PASSWORD: "local-only-secret",
      }),
    ).rejects.toThrow(/local/i);
  });

  it("applies migrations before creating the opted-in account", async () => {
    const events: string[] = [];
    const client = { close: vi.fn(async () => undefined) };
    const createClient = vi.fn(() => client as never);

    const result = await runLocalAdminBootstrap(
      {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/seovista",
        SEOVISTA_ADMIN_PASSWORD: "migration-order-secret",
      },
      {
        createClient,
        applyMigrations: async () => {
          events.push("migrations");
          return [{ id: 1 } as never];
        },
        ensureAdmin: async () => {
          events.push("admin");
          return { id: "admin-id" };
        },
      },
    );

    expect(events).toEqual(["migrations", "admin"]);
    expect(result.status).toBe("created");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("creates an active deterministic operator and updates it idempotently", async () => {
    const first = await ensureAdminBootstrap(env.db, "first-local-secret");
    expect(first.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(first.display_name).toBe(DEFAULT_ADMIN_DISPLAY_NAME);
    expect(first.status).toBe("active");

    const second = await ensureAdminBootstrap(env.db, "second-local-secret");
    expect(second.id).toBe(first.id);

    const row = await env.db.query<{
      email: string;
      display_name: string;
      password_hash: string;
      status: string;
    }>(
      "SELECT email, display_name, password_hash, status FROM admin_users WHERE id = $1",
      [first.id],
    );
    expect(row.rows[0]).toMatchObject({
      email: DEFAULT_ADMIN_EMAIL,
      display_name: DEFAULT_ADMIN_DISPLAY_NAME,
      status: "active",
    });
    expect(verifyAdminPasswordHash("second-local-secret", row.rows[0]!.password_hash)).toBe(true);
    expect(verifyAdminPasswordHash("first-local-secret", row.rows[0]!.password_hash)).toBe(false);

    const role = await env.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM rbac_subject_roles sr
       INNER JOIN rbac_roles r ON r.id = sr.role_id
       WHERE sr.subject_identity = $1 AND r.canonical_identity = 'operator'`,
      [first.id],
    );
    expect(role.rows[0]?.count).toBe(1);
  });

  it("does not expose the password through its logger", async () => {
    const secret = "logger-must-not-see-this";
    const logger = vi.fn();
    await runLocalAdminBootstrap(
      {
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://localhost:5432/seovista",
        SEOVISTA_ADMIN_PASSWORD: secret,
      },
      {
        createClient: () => ({
          ...env.db,
          close: vi.fn(async () => undefined),
        }),
        applyMigrations: async () => [],
        ensureAdmin: async () => ({ id: "admin-id" }),
        logger,
      },
    );

    expect(logger.mock.calls.flat().join(" ")).not.toContain(secret);
  });
});
