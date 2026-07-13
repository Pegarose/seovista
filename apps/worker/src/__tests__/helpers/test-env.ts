import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import IORedis from "ioredis";
import { createDbClient, createMigrationRunner, defaultMigrationsDir } from "../../db/index.js";
import type { DbClient } from "../../db/client.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "../../../../../");

export interface TestEnvironment {
  projectId: string;
  databaseName: string;
  databaseUrl: string;
  redisUrl: string;
  redisDb: number;
  db: DbClient;
  cleanup: () => Promise<void>;
}

function generateProjectId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `seovista_test_${timestamp}_${random}`;
}

function ensureDocker(): void {
  // docker compose up -d is idempotent: starts containers if they exist,
  // creates them if they don't
  execSync("docker compose up -d postgres redis", {
    cwd: PROJECT_ROOT,
    stdio: "pipe",
  });
}

async function waitForPostgres(): Promise<void> {
  const start = Date.now();
  const timeout = 30_000;
  const adminUrl = "postgresql://seovista:seovista@127.0.0.1:55432/postgres";
  const adminDb = createDbClient({ connectionString: adminUrl, max: 1 });

  try {
    while (Date.now() - start < timeout) {
      try {
        await adminDb.query("SELECT 1");
        await adminDb.close();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } finally {
    await adminDb.close().catch(() => {
      // ignore close errors
    });
  }

  throw new Error("PostgreSQL did not become healthy within timeout");
}

async function createDatabase(databaseName: string): Promise<void> {
  const adminDb = createDbClient({
    connectionString: "postgresql://seovista:seovista@127.0.0.1:55432/postgres",
    max: 1,
  });
  try {
    await adminDb.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminDb.close();
  }
}

async function dropDatabase(databaseName: string): Promise<void> {
  const adminDb = createDbClient({
    connectionString: "postgresql://seovista:seovista@127.0.0.1:55432/postgres",
    max: 1,
  });
  try {
    await adminDb.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await adminDb.close();
  }
}

async function flushRedisDb(redisUrl: string): Promise<void> {
  const redis = new IORedis(redisUrl, { lazyConnect: true });
  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const projectId = generateProjectId();
  const databaseName = projectId;
  const redisDb = Math.floor(Math.random() * 15) + 1;
  const databaseUrl = `postgresql://seovista:seovista@127.0.0.1:55432/${databaseName}`;
  const redisUrl = `redis://127.0.0.1:56379/${redisDb}`;

  ensureDocker();
  await waitForPostgres();
  await createDatabase(databaseName);

  const db = createDbClient({ connectionString: databaseUrl, max: 5 });
  const runner = createMigrationRunner(db, defaultMigrationsDir());
  await runner.applyAll();

  async function cleanup(): Promise<void> {
    await db.close();
    await flushRedisDb(redisUrl).catch(() => {
      // ignore redis cleanup errors
    });
    await dropDatabase(databaseName).catch(() => {
      // ignore drop errors during cleanup
    });
    // Docker containers are NOT stopped here; they remain available for
    // other test files. The vitest globalTeardown or the test runner's
    // process exit handles final Docker cleanup.
  }

  return {
    projectId,
    databaseName,
    databaseUrl,
    redisUrl,
    redisDb,
    db,
    cleanup,
  };
}

export function buildWorkerEnv(env: TestEnvironment): Record<string, string> {
  return {
    NODE_ENV: "test",
    DATABASE_URL: env.databaseUrl,
    REDIS_URL: env.redisUrl,
    SEOVISTA_PROJECT_ID: env.projectId,
  };
}
