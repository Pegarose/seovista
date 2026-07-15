import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import IORedis from "ioredis";
import { createDbClient, createMigrationRunner, defaultMigrationsDir } from "../../db/index.js";
import type { DbClient } from "../../db/client.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "../../../../../");

export interface LifecycleContext {
  runId: string;
  projectId: string;
  composeProject: string;
  databaseName: string;
  redisNamespace: string;
  redisDatabase: number;
  queuePrefix: string;
  correlationIdPrefix: string;
  hostPorts: { postgres: number; redis: number };
  createdAt: string;
  cleanupAuthority: string;
  evidenceDirectory: string;
  ownershipToken: string;
}

export interface ParentStack {
  contextPath: string;
  context: LifecycleContext;
  ownsStack: boolean;
}

export interface TestEnvironment {
  projectId: string;
  databaseName: string;
  databaseUrl: string;
  redisUrl: string;
  redisDb: number;
  redisNamespace: string;
  queuePrefix: string;
  correlationIdPrefix: string;
  lifecycleContextPath: string;
  db: DbClient;
  cleanup: () => Promise<void>;
}

const LIFECYCLE_SCRIPT_PATH = resolve(PROJECT_ROOT, "scripts", "infrastructure-lifecycle.js");
const CONTAINER_NAME_CONFLICT_PATTERN = /Conflict\. The container name "\/[^"]+" is already in use by container/;
const START_PARENT_STACK_MAX_RETRIES = 5;
const START_PARENT_STACK_RETRY_DELAY_MS = 500;
const DEFAULT_POSTGRES_PORT = 55432;
let providedContextPath: string | undefined;

export type ExecSyncFn = (command: string, options?: { cwd?: string; encoding?: "utf8" }) => string;
export type ReadContextFn = (path: string) => LifecycleContext;

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function runLifecycleCommand(
  args: string[],
  exec: ExecSyncFn = (cmd, opts) => execSync(cmd, opts).toString(),
): string {
  return exec(`node ${quote(LIFECYCLE_SCRIPT_PATH)} ${args.map(quote).join(" ")}`, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  }).trim();
}

export function readLifecycleContext(path: string): LifecycleContext {
  const record = JSON.parse(readFileSync(resolve(path), "utf8")) as { context?: LifecycleContext };
  if (!record.context?.ownershipToken || !record.context.cleanupAuthority) {
    throw new Error("Lifecycle context is missing durable ownership authority");
  }
  return record.context;
}

function generateParentRunId(): string {
  return `seovista-worker-tests-${process.pid}-${Date.now().toString(36)}`;
}

export async function startParentStack(
  exec: ExecSyncFn = (cmd, opts) => execSync(cmd, opts).toString(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  readContext: ReadContextFn = readLifecycleContext,
): Promise<ParentStack> {
  let lastError: unknown;
  const runId = generateParentRunId();
  for (let attempt = 1; attempt <= START_PARENT_STACK_MAX_RETRIES; attempt++) {
    try {
      const contextPath = runLifecycleCommand(["start", runId], exec);
      return { contextPath, context: readContext(contextPath), ownsStack: true };
    } catch (error) {
      if (!CONTAINER_NAME_CONFLICT_PATTERN.test(String(error))) throw error;
      lastError = error;
      if (attempt < START_PARENT_STACK_MAX_RETRIES) await sleep(START_PARENT_STACK_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

export async function resolveParentLifecycleContext(
  environment: NodeJS.ProcessEnv = process.env,
  exec: ExecSyncFn = (cmd, opts) => execSync(cmd, opts).toString(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  readContext: ReadContextFn = readLifecycleContext,
): Promise<ParentStack> {
  const suppliedPath = environment.SEOVISTA_LIFECYCLE_CONTEXT_PATH;
  if (suppliedPath) {
    if (!existsSync(resolve(suppliedPath)) && readContext === readLifecycleContext) {
      throw new Error(`Parent lifecycle context does not exist: ${suppliedPath}`);
    }
    return { contextPath: suppliedPath, context: readContext(suppliedPath), ownsStack: false };
  }
  return startParentStack(exec, sleep, readContext);
}

export function setProvidedLifecycleContextPath(contextPath: string): void {
  providedContextPath = contextPath;
}

async function getParentStack(): Promise<ParentStack> {
  const contextPath = providedContextPath ?? process.env.SEOVISTA_LIFECYCLE_CONTEXT_PATH;
  if (!contextPath) {
    throw new Error("Worker tests require the Vitest global setup to provide one lifecycle context");
  }
  return resolveParentLifecycleContext({ ...process.env, SEOVISTA_LIFECYCLE_CONTEXT_PATH: contextPath });
}

export function stopParentStack(
  stack: ParentStack,
  exec: ExecSyncFn = (cmd, opts) => execSync(cmd, opts).toString(),
): void {
  if (!stack.ownsStack) return;
  runLifecycleCommand(["teardown", stack.contextPath], exec);
}

function generateProjectId(): string {
  return `seovista_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveRedisDb(_projectId: string, context: LifecycleContext): number {
  return context.redisDatabase;
}

export function buildPostgresConnectionUrl(port: number, databaseName = "postgres"): string {
  const user = process.env.SEOVISTA_POSTGRES_USER ?? "seovista";
  const password = process.env.SEOVISTA_POSTGRES_PASSWORD ?? "seovista";
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const protocol = ["postgresql:", "//"].join("");
  return `${protocol}${encodedUser}:${encodedPassword}@127.0.0.1:${port}/${databaseName}`;
}

export type CreateDbClientFn = (options: { connectionString: string; max: number }) => DbClient;

export async function waitForPostgres(
  port: number,
  createClient: CreateDbClientFn = (options) => createDbClient(options),
): Promise<void> {
  const timeoutAt = Date.now() + 30_000;
  const adminDb = createClient({ connectionString: buildPostgresConnectionUrl(port), max: 1 });
  try {
    while (Date.now() < timeoutAt) {
      try {
        await adminDb.query("SELECT 1");
        return;
      } catch {
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
      }
    }
  } finally {
    await adminDb.close().catch(() => undefined);
  }
  throw new Error(`PostgreSQL on lifecycle port ${port} did not become healthy within timeout`);
}

export async function createDatabase(
  databaseName: string,
  port = DEFAULT_POSTGRES_PORT,
  createClient: CreateDbClientFn = (options) => createDbClient(options),
): Promise<void> {
  const adminDb = createClient({ connectionString: buildPostgresConnectionUrl(port), max: 1 });
  try {
    await adminDb.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminDb.close();
  }
}

export async function dropDatabase(
  databaseName: string,
  port = DEFAULT_POSTGRES_PORT,
  createClient: CreateDbClientFn = (options) => createDbClient(options),
): Promise<void> {
  const adminDb = createClient({ connectionString: buildPostgresConnectionUrl(port), max: 1 });
  try {
    await adminDb.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await adminDb.close();
  }
}

async function deleteRedisPatterns(redisUrl: string, patterns: string[]): Promise<void> {
  const redis = new IORedis(redisUrl, { lazyConnect: true });
  try {
    await redis.connect();
    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    }
  } finally {
    await redis.quit();
  }
}

type CleanupOperation = () => Promise<void>;

type ProvisioningClient = Pick<DbClient, "close">;

export interface TestDatabaseProvisioningDependencies {
  createDatabase: (databaseName: string) => Promise<void>;
  createClient: (options: { connectionString: string; max: number }) => DbClient;
  applyMigrations: (client: DbClient) => Promise<void>;
  dropDatabase: (databaseName: string) => Promise<void>;
}

function attachProvisioningCleanupFailure(provisioningError: unknown, cleanupFailures: unknown[]): void {
  if (cleanupFailures.length === 0) return;
  const cleanupError = cleanupFailures.length === 1
    ? cleanupFailures[0]
    : new AggregateError(cleanupFailures, "Test database provisioning cleanup failed");
  if (provisioningError instanceof Error) {
    Object.defineProperty(provisioningError, "cleanupError", {
      value: cleanupError,
      enumerable: false,
      configurable: true,
    });
    return;
  }
  throw new AggregateError([provisioningError, cleanupError], "Test database provisioning failed and cleanup failed");
}

export async function provisionTestDatabase(
  databaseName: string,
  databaseUrl: string,
  dependencies: TestDatabaseProvisioningDependencies = {
    createDatabase,
    createClient: (options) => createDbClient(options),
    applyMigrations: async (client) => {
      await createMigrationRunner(client, defaultMigrationsDir()).applyAll();
    },
    dropDatabase,
  },
): Promise<DbClient> {
  let databaseCreated = false;
  let client: ProvisioningClient | undefined;

  try {
    databaseCreated = true;
    await dependencies.createDatabase(databaseName);
    client = dependencies.createClient({ connectionString: databaseUrl, max: 5 });
    await dependencies.applyMigrations(client as DbClient);
    return client as DbClient;
  } catch (provisioningError) {
    const cleanupFailures: unknown[] = [];
    if (client) {
      try {
        await client.close();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (databaseCreated) {
      try {
        await dependencies.dropDatabase(databaseName);
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    attachProvisioningCleanupFailure(provisioningError, cleanupFailures);
    throw provisioningError;
  }
}

export function createTestEnvironmentCleanup(
  db: Pick<DbClient, "close">,
  deleteRedis: CleanupOperation,
  dropDatabase: CleanupOperation,
): () => Promise<void> {
  let completed = false;
  let inFlight: Promise<void> | undefined;
  const operations: CleanupOperation[] = [
    () => db.close(),
    deleteRedis,
    dropDatabase,
  ];
  const completedOperations = operations.map(() => false);

  async function runCleanup(): Promise<void> {
    const failures: unknown[] = [];

    for (const [index, operation] of operations.entries()) {
      if (completedOperations[index]) continue;
      try {
        await operation();
        completedOperations[index] = true;
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw failures[0];
    }
    completed = true;
  }

  return async function cleanup(): Promise<void> {
    if (completed) return;
    if (inFlight) return inFlight;

    const current = runCleanup();
    inFlight = current;
    try {
      await current;
    } finally {
      if (inFlight === current) inFlight = undefined;
    }
  };
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  const parent = await getParentStack();
  const projectId = generateProjectId();
  const databaseName = projectId;
  const redisDb = deriveRedisDb(projectId, parent.context);
  const databaseUrl = buildPostgresConnectionUrl(parent.context.hostPorts.postgres, databaseName);
  const redisUrl = `redis://127.0.0.1:${parent.context.hostPorts.redis}/${redisDb}`;
  const redisNamespace = `${parent.context.redisNamespace}${projectId}:`;
  const queuePrefix = `${parent.context.queuePrefix}:${projectId}`;
  const correlationIdPrefix = `${parent.context.correlationIdPrefix}${projectId}-`;

  await waitForPostgres(parent.context.hostPorts.postgres);
  const db = await provisionTestDatabase(databaseName, databaseUrl, {
    createDatabase: (name) => createDatabase(name, parent.context.hostPorts.postgres),
    createClient: (options) => createDbClient(options),
    applyMigrations: async (client) => {
      await createMigrationRunner(client, defaultMigrationsDir()).applyAll();
    },
    dropDatabase: (name) => dropDatabase(name, parent.context.hostPorts.postgres),
  });
  const cleanup = createTestEnvironmentCleanup(
    db,
    () => deleteRedisPatterns(redisUrl, [`${redisNamespace}*`, `${queuePrefix}:*`]),
    () => dropDatabase(databaseName, parent.context.hostPorts.postgres),
  );

  return {
    projectId,
    databaseName,
    databaseUrl,
    redisUrl,
    redisDb,
    redisNamespace,
    queuePrefix,
    correlationIdPrefix,
    lifecycleContextPath: parent.contextPath,
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
    SEOVISTA_REDIS_NAMESPACE: env.redisNamespace,
    SEOVISTA_QUEUE_PREFIX: env.queuePrefix,
    SEOVISTA_CORRELATION_ID_PREFIX: env.correlationIdPrefix,
    SEOVISTA_LIFECYCLE_CONTEXT_PATH: env.lifecycleContextPath,
  };
}
