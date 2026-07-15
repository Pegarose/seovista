import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { checkWorkerHealth } from "../../apps/worker/src/health.js";
import { buildPostgresConnectionUrl } from "../../apps/worker/src/__tests__/helpers/test-env.js";
import { createRunContext } from "../../scripts/infrastructure-lifecycle.js";

type RunContext = ReturnType<typeof createRunContext>;

const root = resolve(import.meta.dirname, "../..");
const lifecycleScript = resolve(root, "scripts/infrastructure-lifecycle.js");
const evidenceDirectory = resolve(root, ".lifecycle-evidence");

interface LifecycleResult {
  exitCode: number;
  output: string;
}

function runLifecycle(args: string[], timeout = 60_000): LifecycleResult {
  try {
    const output = execSync(`node ${lifecycleScript} ${args.join(" ")}`, {
      cwd: root,
      encoding: "utf8",
      timeout,
      windowsHide: true,
    }).trim();
    return { exitCode: 0, output };
  } catch (error) {
    const execError = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number };
    const stdout = typeof execError.stdout === "string" ? execError.stdout : String(execError.stdout ?? "");
    const stderr = typeof execError.stderr === "string" ? execError.stderr : String(execError.stderr ?? "");
    const exitCode = typeof execError.status === "number" ? execError.status : 1;
    return { exitCode, output: `${stdout}${stderr}`.trim() };
  }
}

function readEvidence(runId: string, phase: string): unknown {
  const path = resolve(evidenceDirectory, runId, `${phase}.json`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPostgres(context: RunContext, attempts = 30): void {
  for (let i = 0; i < attempts; i++) {
    const { exitCode } = runLifecycle(["health", resolve(evidenceDirectory, `${context.runId}-context.json`), "postgres"]);
    if (exitCode === 0) return;
    // Simple synchronous sleep using Atomics.wait would be ideal, but Node's
    // worker threads are not available here. Use a small busy-wait to avoid
    // introducing async sleep for the sync helper.
    const until = Date.now() + 500;
    while (Date.now() < until) {
      // busy wait
    }
  }
  throw new Error("PostgreSQL did not become healthy within timeout");
}

function waitForHealthDown(context: RunContext, attempts = 20): void {
  for (let i = 0; i < attempts; i++) {
    const { exitCode } = runLifecycle(["health", resolve(evidenceDirectory, `${context.runId}-context.json`), "postgres"]);
    if (exitCode !== 0) return;
    const until = Date.now() + 500;
    while (Date.now() < until) {
      // busy wait
    }
  }
  throw new Error("PostgreSQL health did not become unavailable within timeout");
}

function docker(args: string[], timeout = 30_000): string {
  return execSync(`docker ${args.join(" ")}`, {
    cwd: root,
    encoding: "utf8",
    timeout,
  }).trim();
}

function normalizeFingerprint(fingerprint: { containers: string[]; networks: string[]; volumes: string[] }, context: RunContext) {
  return {
    containers: fingerprint.containers.filter((name) => !name.startsWith(`${context.composeProject}-`)),
    networks: fingerprint.networks.filter((name) => !name.startsWith(`${context.composeProject}_`)),
    volumes: fingerprint.volumes.filter((name) => !name.startsWith(`${context.composeProject}_`)),
  };
}

function getListenerPort(listener: unknown): string {
  return typeof listener === "string"
    ? listener
    : String((listener as { LocalPort?: number } | undefined)?.LocalPort ?? "");
}

function startStack(runId: string, createdContextPaths?: Set<string>): RunContext {
  const { exitCode, output } = runLifecycle(["start", runId]);
  if (exitCode !== 0) {
    throw new Error(`Lifecycle start failed with exit ${exitCode}: ${output}`);
  }
  const contextPath = output.trim();
  createdContextPaths?.add(contextPath);
  const context = JSON.parse(readFileSync(contextPath, "utf8")).context as RunContext;
  return context;
}

function teardownStack(context: RunContext): LifecycleResult {
  const contextPath = resolve(evidenceDirectory, `${context.runId}-context.json`);
  return runLifecycle(["teardown", contextPath]);
}

function isOwnedContainerRunning(context: RunContext): boolean {
  const containers = docker(["ps", "-a", "--format", "{{.Names}}"]);
  return containers.includes(`${context.composeProject}-postgres-1`);
}

function countOwnedResources(context: RunContext): { containers: number; networks: number; volumes: number } {
  const allContainers = docker(["ps", "-a", "--format", "{{.Names}}"]).split(/\r?\n/);
  const allNetworks = docker(["network", "ls", "--format", "{{.Name}}"]).split(/\r?\n/);
  const allVolumes = docker(["volume", "ls", "--format", "{{.Name}}"]).split(/\r?\n/);
  const hyphenPrefix = `${context.composeProject}-`;
  const underscorePrefix = `${context.composeProject}_`;
  return {
    containers: allContainers.filter((name) => name.startsWith(hyphenPrefix)).length,
    networks: allNetworks.filter((name) => name.startsWith(underscorePrefix)).length,
    volumes: allVolumes.filter((name) => name.startsWith(underscorePrefix)).length,
  };
}

function listLegacyVolumes(): string[] {
  return docker(["volume", "ls", "--format", "{{.Name}}"])
    .split(/\r?\n/)
    .filter((name) => name.startsWith("seovista-tests_") || name.startsWith("seovista_"))
    .sort();
}

function inspectLabels(objectType: "container" | "network" | "volume", name: string): Record<string, string> {
  const inspection = JSON.parse(docker([objectType, "inspect", name])) as Array<{
    Config?: { Labels?: Record<string, string> };
    Labels?: Record<string, string>;
  }>;
  return inspection[0]?.Config?.Labels ?? inspection[0]?.Labels ?? {};
}

function writeRedisEvidence(context: RunContext): { namespaceKey: string; queueKey: string } {
  const namespaceKey = `${context.redisNamespace}scenario`;
  const queueKey = `${context.queuePrefix}:scenario-ping:meta`;
  docker([
    "compose",
    "-p",
    context.composeProject,
    "exec",
    "-T",
    "redis",
    "redis-cli",
    "-n",
    String(context.redisDatabase),
    "MSET",
    namespaceKey,
    "owned",
    queueKey,
    "owned",
  ]);
  return { namespaceKey, queueKey };
}

describe("isolated lifecycle scenarios", () => {
  let legacyVolumesBefore: string[] = [];
  const createdContextPaths = new Set<string>();

  beforeAll(() => {
    legacyVolumesBefore = listLegacyVolumes();
  });

  it("starts a run, records Redis namespace and queue evidence, and preserves unrelated fingerprints", () => {
    const context = startStack("seovista-lc-success", createdContextPaths);
    const redisKeys = writeRedisEvidence(context);
    const unrelatedKey = `unrelated:${context.runId}`;
    const unrelatedRedisContainer = `seovista-unrelated-redis-${context.runId.slice(-12)}`;
    docker(["run", "-d", "--name", unrelatedRedisContainer, "redis:7.4-alpine"]);
    docker(["exec", unrelatedRedisContainer, "redis-cli", "SET", unrelatedKey, "preserve"]);

    const beforeTeardown = runLifecycle(["teardown", resolve(evidenceDirectory, `${context.runId}-context.json`)]);
    expect(beforeTeardown.exitCode).toBe(0);

    const evidence = readEvidence(context.runId, "before-teardown") as {
      inventory: {
        containers: string[];
        networks: string[];
        volumes: string[];
        listeners: string[];
        databases: string[];
        redisNamespaces: string[];
        queues: string[];
        unrelatedFingerprints: { containers: string[]; networks: string[]; volumes: string[] };
      };
    };
    expect(evidence.inventory.containers).toContain(`${context.composeProject}-postgres-1`);
    expect(evidence.inventory.networks).toContain(`${context.composeProject}_default`);
    expect(evidence.inventory.volumes).toContain(`${context.composeProject}_seovista-postgres-data`);
    expect(evidence.inventory.listeners.some((listener) => getListenerPort(listener).includes("55432"))).toBe(true);
    expect(evidence.inventory.databases).toContain(context.databaseName);
    expect(evidence.inventory.redisNamespaces).toContain(redisKeys.namespaceKey);
    expect(evidence.inventory.queues).toContain(redisKeys.queueKey);
    expect(evidence.inventory.unrelatedFingerprints.volumes).toEqual(expect.arrayContaining(legacyVolumesBefore));

    const afterTeardown = readEvidence(context.runId, "after-teardown") as {
      inventory: {
        containers: string[];
        networks: string[];
        volumes: string[];
        listeners: string[];
        unrelatedFingerprints: { containers: string[]; networks: string[]; volumes: string[] };
      };
    };
    expect(afterTeardown.inventory.containers).toHaveLength(0);
    expect(afterTeardown.inventory.networks).toHaveLength(0);
    expect(afterTeardown.inventory.volumes).toHaveLength(0);
    expect(
      afterTeardown.inventory.listeners.filter(
        (listener) =>
          getListenerPort(listener).includes(String(context.hostPorts.postgres)) ||
          getListenerPort(listener).includes(String(context.hostPorts.redis)),
      ),
    ).toHaveLength(0);
    expect(afterTeardown.inventory.unrelatedFingerprints).toEqual(
      normalizeFingerprint(evidence.inventory.unrelatedFingerprints, context),
    );
    expect(afterTeardown.inventory.unrelatedFingerprints.volumes).toEqual(expect.arrayContaining(legacyVolumesBefore));
    expect(docker(["exec", unrelatedRedisContainer, "redis-cli", "GET", unrelatedKey])).toBe("preserve");
    docker(["rm", "-f", unrelatedRedisContainer]);
    expect(listLegacyVolumes()).toEqual(legacyVolumesBefore);
  }, 120_000);

  it("forced startup failure removes all partial resources", () => {
    const blocker = startStack("seovista-lc-blocker", createdContextPaths);
    waitForPostgres(blocker);

    const beforeContexts = new Set(
      docker(["ps", "-a", "--format", "{{.Names}}"])
        .split(/\r?\n/)
        .filter(Boolean),
    );
    const blockedContextFilesBefore = new Set(
      readdirSync(evidenceDirectory).filter((name) => name.startsWith("seovista-lc-blocked-") && name.endsWith("-context.json")),
    );
    const blocked = runLifecycle(["start", "seovista-lc-blocked"]);
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.output).toMatch(/failed|exit|Conflict|port/i);
    const afterContexts = docker(["ps", "-a", "--format", "{{.Names}}"])
      .split(/\r?\n/)
      .filter(Boolean);
    expect(afterContexts).toEqual(expect.arrayContaining([...beforeContexts]));
    const blockedContextFilesAfter = readdirSync(evidenceDirectory).filter(
      (name) => name.startsWith("seovista-lc-blocked-") && name.endsWith("-context.json"),
    );
    const blockedContextFile = blockedContextFilesAfter.find((name) => !blockedContextFilesBefore.has(name));
    expect(blockedContextFile).toBeDefined();
    const blockedContextPath = resolve(evidenceDirectory, blockedContextFile!);
    createdContextPaths.add(blockedContextPath);
    const blockedContext = JSON.parse(readFileSync(blockedContextPath, "utf8")).context as RunContext;
    expect(countOwnedResources(blockedContext)).toEqual({ containers: 0, networks: 0, volumes: 0 });
    const cleanupEvidence = readEvidence(blockedContext.runId, "after-teardown") as {
      inventory: { listeners: string[]; databases: string[]; redisNamespaces: string[]; queues: string[] };
    };
    const blockerListeners = cleanupEvidence.inventory.listeners.filter(
      (listener) =>
        getListenerPort(listener).includes(String(blockedContext.hostPorts.postgres)) ||
        getListenerPort(listener).includes(String(blockedContext.hostPorts.redis)),
    );
    expect(blockerListeners).toHaveLength(2);
    expect(blockerListeners.every((listener) => String((listener as { OwningProcess?: number }).OwningProcess) !== "")).toBe(
      true,
    );
    expect(cleanupEvidence.inventory.databases).not.toContain(blockedContext.databaseName);
    expect(cleanupEvidence.inventory.redisNamespaces).toHaveLength(0);
    expect(cleanupEvidence.inventory.queues).toHaveLength(0);

    expect(teardownStack(blocker).exitCode).toBe(0);
    expect(teardownStack(blockedContext).exitCode).toBe(0);
  }, 120_000);

  it("forced runtime failure remains finite and exact-context teardown cleans owned resources", () => {
    const context = startStack("seovista-lc-runtime-failure", createdContextPaths);
    docker(["stop", `${context.composeProject}-redis-1`]);
    const health = runLifecycle(["health", resolve(evidenceDirectory, `${context.runId}-context.json`), "redis"]);
    expect(health.exitCode).not.toBe(0);
    expect(teardownStack(context).exitCode).toBe(0);
    expect(countOwnedResources(context)).toEqual({ containers: 0, networks: 0, volumes: 0 });
  }, 120_000);

  it("rejects teardown when a same-project wrong-token resource exists and preserves it", () => {
    const context = startStack("seovista-lc-wrong-token", createdContextPaths);
    const volumeName = `${context.composeProject}_wrong-token`;
    docker([
      "volume",
      "create",
      "--label",
      `com.docker.compose.project=${context.composeProject}`,
      "--label",
      "com.seovista.lifecycle.token=wrong",
      volumeName,
    ]);
    expect(inspectLabels("volume", volumeName)["com.seovista.lifecycle.token"]).toBe("wrong");

    const rejected = teardownStack(context);
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toMatch(/missing or mismatched ownership tokens/i);
    expect(docker(["volume", "ls", "--format", "{{.Name}}"]).split(/\r?\n/)).toContain(volumeName);

    docker(["volume", "rm", volumeName]);
    expect(teardownStack(context).exitCode).toBe(0);
  }, 120_000);

  it("keeps application liveness live while PostgreSQL readiness drops and recovers", async () => {
    const context = startStack("seovista-lc-health-postgres", createdContextPaths);
    waitForPostgres(context);
    const options = {
      databaseUrl: buildPostgresConnectionUrl(context.hostPorts.postgres, context.databaseName),
      redisUrl: `redis://127.0.0.1:${context.hostPorts.redis}/${context.redisDatabase}`,
      projectId: context.projectId,
    };

    expect((await checkWorkerHealth(options)).readiness).toBe("ready");
    docker(["stop", `${context.composeProject}-postgres-1`]);
    waitForHealthDown(context);

    const down = await checkWorkerHealth(options);
    expect(down.liveness).toBe("live");
    expect(down.readiness).toBe("not_ready");
    expect(down.dependencies).toContainEqual(expect.objectContaining({ name: "postgres", status: "down" }));

    docker(["start", `${context.composeProject}-postgres-1`]);
    waitForPostgres(context);
    expect((await checkWorkerHealth(options)).readiness).toBe("ready");

    teardownStack(context);
  }, 120_000);

  it("keeps application liveness live while Redis readiness drops and recovers", async () => {
    const context = startStack("seovista-lc-health-redis", createdContextPaths);
    waitForPostgres(context);
    const options = {
      databaseUrl: buildPostgresConnectionUrl(context.hostPorts.postgres, context.databaseName),
      redisUrl: `redis://127.0.0.1:${context.hostPorts.redis}/${context.redisDatabase}`,
      projectId: context.projectId,
    };

    expect((await checkWorkerHealth(options)).readiness).toBe("ready");
    docker(["stop", `${context.composeProject}-redis-1`]);

    const down = await checkWorkerHealth(options);
    expect(down.liveness).toBe("live");
    expect(down.readiness).toBe("not_ready");
    expect(down.dependencies).toContainEqual(expect.objectContaining({ name: "redis", status: "down" }));

    docker(["start", `${context.composeProject}-redis-1`]);
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await checkWorkerHealth(options)).readiness === "ready") break;
      await waitFor(500);
    }
    expect((await checkWorkerHealth(options)).readiness).toBe("ready");

    teardownStack(context);
  }, 120_000);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    it.skipIf(process.platform === "win32")(
      `cleans run-labeled resources on ${signal} interruption`,
      async () => {
        const child = spawn("node", [lifecycleScript, "start", `seovista-lc-${signal.toLowerCase()}`], {
          cwd: root,
          stdio: "pipe",
          windowsHide: true,
        });
        let output = "";
        child.stdout.on("data", (data) => {
          output += data.toString();
        });
        for (let attempt = 0; attempt < 120 && !output.includes("context.json"); attempt++) await waitFor(250);
        const contextPath = output.trim().split(/\r?\n/).at(-1)!;
        const context = JSON.parse(readFileSync(contextPath, "utf8")).context as RunContext;
        child.kill(signal);
        await new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
        expect(isOwnedContainerRunning(context)).toBe(false);
        expect(runLifecycle(["teardown", contextPath]).exitCode).toBe(0);
      },
      90_000,
    );
  }

  it("teardown is idempotent after a successful teardown", () => {
    const context = startStack("seovista-lc-idempotent", createdContextPaths);
    teardownStack(context);

    const { exitCode } = teardownStack(context);
    expect(exitCode).toBe(0);

    const owned = countOwnedResources(context);
    expect(owned.containers).toBe(0);
    expect(owned.networks).toBe(0);
    expect(owned.volumes).toBe(0);
  }, 120_000);

  afterAll(() => {
    for (const contextPath of createdContextPaths) {
      runLifecycle(["teardown", contextPath]);
    }
  }, 120_000);
});
