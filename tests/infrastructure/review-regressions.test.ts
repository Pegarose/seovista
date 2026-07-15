import { describe, expect, it, vi } from "vitest";
import { createRunContext } from "../../scripts/infrastructure-lifecycle-core.js";
import {
  buildUnixListenerProbeScript,
  inspectLifecycleResources,
} from "../../scripts/infrastructure-lifecycle-inspection.js";

function contextFixture(root: string) {
  return createRunContext({
    root,
    runId: "review-authority",
    nonce: "abcdef123456",
    ownershipToken: "a".repeat(64),
    createdAt: "2026-07-15T00:00:00.000Z",
  });
}

describe("fail-closed Docker ownership inspection", () => {
  it("builds a Unix listener probe that exits immediately when ss fails", () => {
    expect(buildUnixListenerProbeScript([55432, 56379])).toContain("output=$(ss -tlnp) || exit $?");
  });

  it("propagates Docker inventory errors instead of treating them as an empty project", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) {
        throw new Error("Docker daemon unavailable");
      }
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/Docker daemon unavailable/);
  });

  it("propagates inspect failures for project-scoped resources", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) return "owned-postgres";
      if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
        throw new Error("inspect permission denied");
      }
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/inspect permission denied/);
  });

  it("propagates unrelated fingerprint inventory failures", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "volume" && args[1] === "ls" && !args.includes("--filter")) {
        throw new Error("unrelated volume inventory unavailable");
      }
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/unrelated volume inventory unavailable/);
  });

  it("propagates listener probe failures during pre-teardown inspection", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string) => {
      if (command === "powershell.exe" || command === "sh") throw new Error("listener probe unavailable");
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/listener probe unavailable/);
  });

  it("propagates PostgreSQL probe failures during pre-teardown inspection", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) {
        return `${context.composeProject}-postgres-1`;
      }
      if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
        return JSON.stringify([{ Config: { Labels: {
          "com.docker.compose.project": context.composeProject,
          "com.docker.compose.service": "postgres",
          "com.seovista.lifecycle.token": context.ownershipToken,
        } }, State: { Running: true } }]);
      }
      if (command === "docker" && args.includes("psql")) throw new Error("psql inspection failed");
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/psql inspection failed/);
  });

  it("propagates Redis probe failures during pre-teardown inspection", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) {
        return `${context.composeProject}-redis-1`;
      }
      if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
        return JSON.stringify([{ Config: { Labels: {
          "com.docker.compose.project": context.composeProject,
          "com.docker.compose.service": "redis",
          "com.seovista.lifecycle.token": context.ownershipToken,
        } }, State: { Running: true } }]);
      }
      if (command === "docker" && args.includes("redis-cli")) throw new Error("redis inspection failed");
      return "";
    });

    await expect(inspectLifecycleResources(context, execute)).rejects.toThrow(/redis inspection failed/);
  });

  it("returns typed unavailable states only after owned service labels are absent", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async () => "");

    const result = await inspectLifecycleResources(context, execute);

    expect(result.inspectionStates.databases).toEqual({ state: "service_unavailable", values: [] });
    expect(result.inspectionStates.redis).toEqual({
      state: "service_unavailable",
      namespaceKeys: [],
      queues: [],
    });
    expect(execute.mock.calls.some(([, args]) => (args as string[]).includes("psql"))).toBe(false);
    expect(execute.mock.calls.some(([, args]) => (args as string[]).includes("redis-cli"))).toBe(false);
  });

  it.each([
    ["underscore-separated", (project: string, service: string) => `${project}_${service}_1`],
    ["arbitrary", (_project: string, service: string) => `external-${service}-container`],
  ])("probes running owned services with %s container names from Compose service labels", async (_label, containerName) => {
    const context = contextFixture("C:/repo");
    const postgresContainer = containerName(context.composeProject, "postgres");
    const redisContainer = containerName(context.composeProject, "redis");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) {
        return `${postgresContainer}\n${redisContainer}`;
      }
      if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
        const name = args[2];
        const service = name === postgresContainer ? "postgres" : "redis";
        return JSON.stringify([{ Config: { Labels: {
          "com.docker.compose.project": context.composeProject,
          "com.docker.compose.service": service,
          "com.seovista.lifecycle.token": context.ownershipToken,
        } }, State: { Running: true } }]);
      }
      if (command === "docker" && args.includes("psql")) return `${context.databaseName}\npostgres`;
      if (command === "docker" && args.includes("redis-cli") && args.at(-1) === `${context.redisNamespace}*`) {
        return `${context.redisNamespace}key`;
      }
      if (command === "docker" && args.includes("redis-cli")) return `${context.queuePrefix}:ping`;
      return "";
    });

    const result = await inspectLifecycleResources(context, execute);

    expect(result.inspectionStates.databases.state).toBe("observed");
    expect(result.inspectionStates.redis.state).toBe("observed");
    expect(execute.mock.calls.some(([, args]) => (args as string[]).includes("psql"))).toBe(true);
    expect(execute.mock.calls.filter(([, args]) => (args as string[]).includes("redis-cli"))).toHaveLength(2);
  });

  it("returns typed observed states for successful listener, database, and Redis probes", async () => {
    const context = contextFixture("C:/repo");
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === "docker" && args[0] === "ps" && args.includes("--filter")) {
        return `${context.composeProject}-postgres-1\n${context.composeProject}-redis-1`;
      }
      if (command === "docker" && args[0] === "container" && args[1] === "inspect") {
        const service = args[2].endsWith("-postgres-1") ? "postgres" : "redis";
        return JSON.stringify([{ Config: { Labels: {
          "com.docker.compose.project": context.composeProject,
          "com.docker.compose.service": service,
          "com.seovista.lifecycle.token": context.ownershipToken,
        } }, State: { Running: true } }]);
      }
      if (command === "docker" && args.includes("psql")) return `${context.databaseName}\npostgres`;
      if (command === "docker" && args.includes("redis-cli") && args.at(-1) === `${context.redisNamespace}*`) {
        return `${context.redisNamespace}key`;
      }
      if (command === "docker" && args.includes("redis-cli")) return `${context.queuePrefix}:ping`;
      return "";
    });

    const result = await inspectLifecycleResources(context, execute);

    expect(result.inspectionStates.listeners).toEqual(expect.objectContaining({ state: "observed" }));
    expect(result.inspectionStates.databases).toEqual({ state: "observed", values: [context.databaseName, "postgres"] });
    expect(result.inspectionStates.redis).toEqual({
      state: "observed",
      namespaceKeys: [`${context.redisNamespace}key`],
      queues: [`${context.queuePrefix}:ping`],
    });
  });
});
