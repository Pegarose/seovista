/**
 * Focused regression tests for the parent-owned lifecycle test helpers.
 *
 * Covers the lifecycle command delegation and deterministic Redis DB selection
 * through injectable exec dependencies without touching real Docker.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildWorkerEnv,
  buildPostgresConnectionUrl,
  createDatabase,
  createTestEnvironmentCleanup,
  deriveRedisDb,
  dropDatabase,
  provisionTestDatabase,
  resolveParentLifecycleContext,
  runLifecycleCommand,
  startParentStack,
  waitForPostgres,
  stopParentStack,
  type ExecSyncFn,
  type LifecycleContext,
} from "./test-env.js";

const PARENT_CONTEXT: LifecycleContext = {
  runId: "seovista-tests-owned",
  projectId: "seovista-tests-owned",
  composeProject: "seovista-tests-owned",
  databaseName: "seovista_tests_owned",
  redisNamespace: "seovista-tests-owned:",
  redisDatabase: 0,
  queuePrefix: "seovista-tests-owned:queue",
  correlationIdPrefix: "seovista-tests-owned-correlation-",
  hostPorts: { postgres: 55432, redis: 56379 },
  createdAt: "2026-07-15T00:00:00.000Z",
  cleanupAuthority: "context:seovista-tests-owned",
  evidenceDirectory: "C:/repo/.lifecycle-evidence/seovista-tests-owned",
  ownershipToken: "a".repeat(64),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function execThatSucceeds(output = ""): ExecSyncFn {
  return vi.fn(() => output);
}

function execThatFails(message: string): ExecSyncFn {
  return vi.fn(() => {
    throw new Error(message);
  });
}

function execSequence(
  steps: Array<{ type: "success"; output: string } | { type: "failure"; message: string }>,
): ExecSyncFn {
  let callCount = 0;
  return vi.fn(() => {
    const step = steps[callCount++];
    if (!step) {
      throw new Error("exec called more times than expected");
    }
    if (step.type === "success") {
      return step.output;
    }
    throw new Error(step.message);
  });
}

function syncSleep(): (ms: number) => Promise<void> {
  return vi.fn(() => Promise.resolve());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runLifecycleCommand", () => {
  it("delegates to the lifecycle script and trims output", () => {
    const exec = execThatSucceeds("  /path/to/context.json  ");

    const result = runLifecycleCommand(["start", "seovista-tests"], exec);

    expect(result).toBe("/path/to/context.json");
    expect(exec).toHaveBeenCalledTimes(1);
    const [command, options] = vi.mocked(exec).mock.calls[0] as [string, { cwd?: string; encoding?: string }];
    expect(command).toMatch(/scripts[\\/]infrastructure-lifecycle\.js" "start" "seovista-tests"$/);
    expect(options?.cwd).toBeTruthy();
    expect(options?.encoding).toBe("utf8");
  });
});

describe("parent lifecycle context", () => {
  it("reuses the exact context path supplied by the parent without starting Docker", async () => {
    const exec = execThatSucceeds();
    const readContext = vi.fn(() => PARENT_CONTEXT);

    const result = await resolveParentLifecycleContext(
      { NODE_ENV: "test", SEOVISTA_LIFECYCLE_CONTEXT_PATH: "C:/owned/context.json" },
      exec,
      syncSleep(),
      readContext,
    );

    expect(result).toEqual({
      contextPath: "C:/owned/context.json",
      context: PARENT_CONTEXT,
      ownsStack: false,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(readContext).toHaveBeenCalledWith("C:/owned/context.json");
  });

  it("starts one owned stack only when no parent context was supplied", async () => {
    const exec = execThatSucceeds("C:/owned/generated-context.json");
    const sleep = syncSleep();
    const readContext = vi.fn(() => PARENT_CONTEXT);

    const result = await startParentStack(exec, sleep, readContext);

    expect(result).toEqual({
      contextPath: "C:/owned/generated-context.json",
      context: PARENT_CONTEXT,
      ownsStack: true,
    });
    expect(exec).toHaveBeenCalledTimes(1);
    const [command] = vi.mocked(exec).mock.calls[0] as [string];
    expect(command).toMatch(/"start" "seovista-worker-tests-[a-z0-9-]+"$/);
    expect(readContext).toHaveBeenCalledWith("C:/owned/generated-context.json");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on the known container-name conflict race then succeeds", async () => {
    const exec = execSequence([
      {
        type: "failure",
        message:
          'Conflict. The container name "/seovista-tests-redis-1" is already in use by container "abc123". You have to remove (or rename) that container to be able to reuse that name.',
      },
      { type: "success", output: ".lifecycle-evidence/seovista-tests-context.json" },
    ]);
    const sleep = syncSleep();

    const readContext = vi.fn(() => PARENT_CONTEXT);
    const result = await startParentStack(exec, sleep, readContext);

    expect(result).toEqual({
      contextPath: ".lifecycle-evidence/seovista-tests-context.json",
      context: PARENT_CONTEXT,
      ownsStack: true,
    });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("does not retry unrelated Docker errors", async () => {
    const exec = execThatFails(
      "Error response from daemon: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
    );
    const sleep = syncSleep();

    await expect(startParentStack(exec, sleep)).rejects.toThrow();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("exhausts retries on a persistent conflict race", async () => {
    const conflict =
      'Conflict. The container name "/seovista-tests-postgres-1" is already in use by container "def456". You have to remove (or rename) that container to be able to reuse that name.';
    const exec = execSequence([
      { type: "failure", message: conflict },
      { type: "failure", message: conflict },
      { type: "failure", message: conflict },
      { type: "failure", message: conflict },
      { type: "failure", message: conflict },
    ]);
    const sleep = syncSleep();

    await expect(startParentStack(exec, sleep)).rejects.toThrow(/Conflict/);
    expect(exec).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
  });
});

describe("stopParentStack", () => {
  it("tears down only a stack owned by this test process", () => {
    const exec = execThatSucceeds("");

    stopParentStack(
      {
        contextPath: "C:/owned/generated-context.json",
        context: PARENT_CONTEXT,
        ownsStack: true,
      },
      exec,
    );

    expect(exec).toHaveBeenCalledTimes(1);
    const [command] = vi.mocked(exec).mock.calls[0] as [string];
    expect(command).toContain("teardown");
    expect(command).toContain("C:/owned/generated-context.json");
  });

  it("does not stop a parent-owned stack", () => {
    const exec = execThatSucceeds("");

    stopParentStack(
      {
        contextPath: "C:/owned/parent-context.json",
        context: PARENT_CONTEXT,
        ownsStack: false,
      },
      exec,
    );

    expect(exec).not.toHaveBeenCalled();
  });

  it("propagates teardown failures for an owned stack", () => {
    const exec = execThatFails("Docker inspection failed during teardown");

    expect(() =>
      stopParentStack(
        {
          contextPath: "C:/owned/generated-context.json",
          context: PARENT_CONTEXT,
          ownsStack: true,
        },
        exec,
      ),
    ).toThrow(/Docker inspection failed during teardown/);
  });
});

describe("parent PostgreSQL port", () => {
  it("uses the parent port for readiness, database creation, and database drop", async () => {
    const parentPort = 61234;
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const createClient = vi.fn((options: { connectionString: string; max: number }) => {
      void options;
      return client;
    });

    await waitForPostgres(parentPort, createClient as never);
    await createDatabase("seovista_test_port", parentPort, createClient as never);
    await dropDatabase("seovista_test_port", parentPort, createClient as never);

    const connectionStrings = createClient.mock.calls.map((call) => call[0]?.connectionString);
    expect(connectionStrings).toEqual([
      buildPostgresConnectionUrl(parentPort),
      buildPostgresConnectionUrl(parentPort),
      buildPostgresConnectionUrl(parentPort),
    ]);
    expect(client.query).toHaveBeenCalledWith("SELECT 1");
    expect(client.query).toHaveBeenCalledWith('CREATE DATABASE "seovista_test_port"');
    expect(client.query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "seovista_test_port" WITH (FORCE)');
  });
});

describe("Redis isolation", () => {
  it("uses the lifecycle-owned Redis database instead of a random shared DB", () => {
    expect(deriveRedisDb("seovista_test_a", PARENT_CONTEXT)).toBe(0);
    expect(deriveRedisDb("seovista_test_b", PARENT_CONTEXT)).toBe(0);
  });
});

describe("test environment cleanup", () => {
  it("attempts every owned resource cleanup, preserves the first failure, and is idempotent", async () => {
    const cleanupCalls: string[] = [];
    const dbClose = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        cleanupCalls.push("db.close");
        throw new Error("database client close failed");
      })
      .mockImplementation(async () => {
        cleanupCalls.push("db.close");
      });
    const deleteRedis = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        cleanupCalls.push("redis namespace and queue deletion");
        throw new Error("Redis cleanup failed");
      })
      .mockImplementation(async () => {
        cleanupCalls.push("redis namespace and queue deletion");
      });
    const dropDatabase = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        cleanupCalls.push("database drop");
        throw new Error("database drop failed");
      })
      .mockImplementation(async () => {
        cleanupCalls.push("database drop");
      });
    const cleanup = createTestEnvironmentCleanup(
      { close: dbClose } as never,
      deleteRedis,
      dropDatabase,
    );

    await expect(cleanup()).rejects.toThrow("database client close failed");
    expect(cleanupCalls).toEqual(["db.close", "redis namespace and queue deletion", "database drop"]);

    await expect(cleanup()).resolves.toBeUndefined();
    expect(cleanupCalls).toEqual([
      "db.close",
      "redis namespace and queue deletion",
      "database drop",
      "db.close",
      "redis namespace and queue deletion",
      "database drop",
    ]);
    expect(dbClose).toHaveBeenCalledTimes(2);
    expect(deleteRedis).toHaveBeenCalledTimes(2);
    expect(dropDatabase).toHaveBeenCalledTimes(2);

    await expect(cleanup()).resolves.toBeUndefined();
    expect(dbClose).toHaveBeenCalledTimes(2);
    expect(deleteRedis).toHaveBeenCalledTimes(2);
    expect(dropDatabase).toHaveBeenCalledTimes(2);
  });
});

describe("test environment provisioning", () => {
  it("closes the client and drops the database when migrations fail, preserving cleanup evidence", async () => {
    const provisioningError = new Error("migration provisioning failed");
    const client = { close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
    const dropDatabase = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      provisionTestDatabase("seovista_test_failure", "test-database-url/seovista_test_failure", {
        createDatabase: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        createClient: vi.fn(() => client as never),
        applyMigrations: vi.fn<() => Promise<void>>().mockRejectedValue(provisioningError),
        dropDatabase,
      }),
    ).rejects.toBe(provisioningError);

    expect(client.close).toHaveBeenCalledTimes(1);
    expect(dropDatabase).toHaveBeenCalledWith("seovista_test_failure");
  });

  it("drops the database when client creation fails and attaches cleanup failure", async () => {
    const provisioningError = new Error("client creation failed");
    const cleanupError = new Error("database drop failed");
    const dropDatabase = vi.fn<() => Promise<void>>().mockRejectedValue(cleanupError);

    await expect(
      provisionTestDatabase("seovista_test_client_failure", "test-database-url/seovista_test_client_failure", {
        createDatabase: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        createClient: vi.fn(() => {
          throw provisioningError;
        }),
        applyMigrations: vi.fn<() => Promise<void>>(),
        dropDatabase,
      }),
    ).rejects.toMatchObject({ message: provisioningError.message, cleanupError });

    expect(dropDatabase).toHaveBeenCalledWith("seovista_test_client_failure");
  });

  it("attempts database cleanup even when database creation reports an error", async () => {
    const provisioningError = new Error("database creation failed");
    const createDatabase = vi.fn<() => Promise<void>>().mockRejectedValue(provisioningError);
    const dropDatabase = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      provisionTestDatabase("seovista_test_create_failure", "test-database-url/seovista_test_create_failure", {
        createDatabase,
        createClient: vi.fn(() => ({ close: vi.fn() }) as never),
        applyMigrations: vi.fn<() => Promise<void>>(),
        dropDatabase,
      }),
    ).rejects.toBe(provisioningError);

    expect(dropDatabase).toHaveBeenCalledWith("seovista_test_create_failure");
  });
});

describe("buildWorkerEnv", () => {
  it("propagates lifecycle namespace and correlation ownership", () => {
    const result = buildWorkerEnv({
      projectId: "seovista_test_a",
      databaseName: "seovista_test_a",
      databaseUrl: "test-database-url/test",
      redisUrl: "redis://127.0.0.1:56379/0",
      redisDb: 0,
      redisNamespace: `${PARENT_CONTEXT.redisNamespace}seovista_test_a:`,
      queuePrefix: `${PARENT_CONTEXT.queuePrefix}:seovista_test_a`,
      correlationIdPrefix: `${PARENT_CONTEXT.correlationIdPrefix}seovista_test_a-`,
      lifecycleContextPath: "C:/owned/parent-context.json",
      db: {} as never,
      cleanup: vi.fn(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        SEOVISTA_REDIS_NAMESPACE: `${PARENT_CONTEXT.redisNamespace}seovista_test_a:`,
        SEOVISTA_QUEUE_PREFIX: `${PARENT_CONTEXT.queuePrefix}:seovista_test_a`,
        SEOVISTA_CORRELATION_ID_PREFIX: `${PARENT_CONTEXT.correlationIdPrefix}seovista_test_a-`,
        SEOVISTA_LIFECYCLE_CONTEXT_PATH: "C:/owned/parent-context.json",
      }),
    );
  });
});
