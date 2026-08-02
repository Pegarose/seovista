import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createDbClient, type DbClient } from "./client.js";
import { createMigrationRunner, defaultMigrationsDir, type Migration } from "./migrations.js";
import { stdoutLogger, type Logger } from "../utils/logger.js";

export const DEFAULT_ADMIN_EMAIL = "admin@seovista.local";
export const DEFAULT_ADMIN_DISPLAY_NAME = "SeoVista Local Operator";

export interface AdminBootstrapResult {
  id: string;
  email: string;
  display_name: string;
  status: "active";
}

export type AdminBootstrapIdentity = Pick<AdminBootstrapResult, "id"> &
  Partial<Omit<AdminBootstrapResult, "id">>;

export interface LocalAdminBootstrapEnvironment {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  SEOVISTA_ADMIN_PASSWORD?: string;
}

export interface LocalAdminBootstrapDependencies {
  createClient?: (options: { connectionString: string; max: number }) => DbClient;
  applyMigrations?: (client: DbClient) => Promise<Migration[]>;
  ensureAdmin?: (client: DbClient, password: string) => Promise<AdminBootstrapIdentity>;
  logger?: Logger;
}

export interface LocalAdminBootstrapResult {
  status: "skipped" | "created";
  admin?: AdminBootstrapIdentity;
}

function createAdminPasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyAdminPasswordHash(password: string, encoded: string): boolean {
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || expectedHex.length !== 128) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function ensureAdminBootstrap(
  client: DbClient,
  password: string,
): Promise<AdminBootstrapResult> {
  if (!password) throw new Error("SEOVISTA_ADMIN_PASSWORD must not be empty");

  const result = await client.query<AdminBootstrapResult>(
    `
      INSERT INTO admin_users (email, display_name, password_hash, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        status = 'active',
        updated_at = now()
      RETURNING id, email, display_name, status
    `,
    [DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_DISPLAY_NAME, createAdminPasswordHash(password)],
  );
  const admin = result.rows[0];
  if (!admin) throw new Error("Admin bootstrap user could not be resolved");

  await client.query(
    `
      INSERT INTO rbac_subject_roles (subject_identity, role_id)
      SELECT $1, id
      FROM rbac_roles
      WHERE canonical_identity = 'operator'
      ON CONFLICT (subject_identity, role_id) DO NOTHING
    `,
    [admin.id],
  );

  return admin;
}

function assertLocalBootstrapTarget(environment: LocalAdminBootstrapEnvironment): string {
  if (environment.NODE_ENV === "production") {
    throw new Error("Local admin bootstrap is disabled in production");
  }

  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for local admin bootstrap");

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Local admin bootstrap requires a valid local database URL");
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
    throw new Error("Local admin bootstrap requires a localhost database target");
  }

  return connectionString;
}

export async function runLocalAdminBootstrap(
  environment: LocalAdminBootstrapEnvironment = process.env,
  dependencies: LocalAdminBootstrapDependencies = {},
): Promise<LocalAdminBootstrapResult> {
  const password = environment.SEOVISTA_ADMIN_PASSWORD;
  if (!password?.trim()) return { status: "skipped" };

  const connectionString = assertLocalBootstrapTarget(environment);
  const createClient = dependencies.createClient ?? ((options) => createDbClient(options));
  const client = createClient({ connectionString, max: 5 });
  const applyMigrations = dependencies.applyMigrations ?? ((db) =>
    createMigrationRunner(db, defaultMigrationsDir()).applyAll());
  const ensureAdmin = dependencies.ensureAdmin ?? ensureAdminBootstrap;
  const logger = dependencies.logger ?? stdoutLogger;

  try {
    const appliedMigrations = await applyMigrations(client);
    const admin = await ensureAdmin(client, password);
    logger("Local admin bootstrap completed", {
      adminId: admin.id,
      appliedMigrations: appliedMigrations.length,
    });
    return { status: "created", admin };
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  await runLocalAdminBootstrap();
}

import { pathToFileURL } from "node:url";

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : "")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Local admin bootstrap failed");
    process.exitCode = 1;
  });
}
