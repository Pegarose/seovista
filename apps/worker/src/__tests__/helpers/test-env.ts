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

// ---------------------------------------------------------------------------
// Injectable helpers (exported for focused unit tests)
// ---------------------------------------------------------------------------

/** Synchronous command executor matching the signature of execSync. */
export type ExecFn = (command: string, options?: { cwd?: string; stdio?: "pipe" }) => void;

/** Async sleep function (default uses setTimeout). */
export type SleepFn = (ms: number) => Promise<void>;

/**
 * Options for dockerComposeUp, allowing injection of exec and sleep for
 * deterministic testing.
 */
export interface DockerComposeUpOptions {
  exec?: ExecFn;
  sleep?: SleepFn;
  maxRetries?: number;
  baseDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Container-name conflict detection
// ---------------------------------------------------------------------------

/**
 * Pattern that matches the **only** known transient race from concurrent
 * `docker compose up -d`: a fixed container name is already in use by a
 * container that the other concurrent caller just created.
 *
 * Example Docker error:
 *   Conflict. The container name "/seovista-postgres" is already in use
 *   by container "abc123...".
 */
const CONTAINER_NAME_CONFLICT_RE = /is already in use by container/;

/**
 * Returns true when the error output matches the narrow container-name
 * creation race that is safe to retry.
 */
function isContainerNameConflict(output: string): boolean {
  return CONTAINER_NAME_CONFLICT_RE.test(output);
}

/**
 * Extract diagnostic output from errors thrown by execSync (or a test stub).
 * Exported for focused unit tests.
 */
export function extractErrorOutput(err: unknown): string {
  if (err instanceof Error) {
    const parts: string[] = [err.message];
    if ("stdout" in err) {
      const stdout = String((err as { stdout?: unknown }).stdout ?? "");
      if (stdout) parts.push(stdout);
    }
    if ("stderr" in err) {
      const stderr = String((err as { stderr?: unknown }).stderr ?? "");
      if (stderr) parts.push(stderr);
    }
    return parts.join("\n");
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// dockerComposeUp – concurrent-safe Compose startup
// ---------------------------------------------------------------------------

/**
 * Run `docker compose up -d postgres redis` with narrow retry for the known
 * fixed-container-name creation race.
 *
 * - Default exec is node:child_process execSync (synchronous).
 * - Default sleep is a promise-based setTimeout.
 * - Retries are bounded (max 3) and use linear backoff (200ms, 400ms, 600ms).
 * - Unrelated Docker errors fail immediately without retry.
 * - No shell-spawned Node subprocess is used for the retry delay.
 */
export async function dockerComposeUp(options: DockerComposeUpOptions = {}): Promise<void> {
  const exec: ExecFn =
    options.exec ??
    ((cmd: string, opts?: { cwd?: string; stdio?: "pipe" }) => {
      const execOptions: { cwd?: string; stdio: "pipe" } = { stdio: "pipe" };
      if (opts?.cwd) execOptions.cwd = opts.cwd;
      execSync(cmd, execOptions);
    });
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      exec("docker compose up -d postgres redis", {
        cwd: PROJECT_ROOT,
        stdio: "pipe",
      });
      return; // success
    } catch (err) {
      const output = extractErrorOutput(err);

      // Only retry the narrow container-name creation race.
      if (!isContainerNameConflict(output) || attempt === maxRetries) {
        throw err;
      }

      // Linear backoff: 200ms, 400ms, 600ms
      const delay = baseDelayMs * (attempt + 1);
      await sleep(delay);
    }
  }
}

function generateProjectId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `seovista_test_${timestamp}_${random}`;
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

  await dockerComposeUp();
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
    // Docker containers are NOT stopped here: they are shared across test
    // files that run in the same vitest worker. The test-runner process
    // exit (or explicit teardown via docker compose down) handles final
    // Docker cleanup. cleanup() is owned by each TestEnvironment instance
    // and only tears down project-scoped database/Redis resources.
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
