import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({ connectionString: "" }));
const redisState = vi.hoisted(() => ({ redisUrl: "" }));

vi.mock("../db/client.js", () => ({
  createDbClient: ({ connectionString }: { connectionString: string }) => {
    dbState.connectionString = connectionString;
    return { close: vi.fn().mockResolvedValue(undefined) };
  },
  checkDbConnection: vi.fn().mockResolvedValue(true),
}));

vi.mock("../queue/config.js", () => ({
  createRedisConnection: ({ redisUrl }: { redisUrl: string }) => {
    redisState.redisUrl = redisUrl;
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
  },
  checkRedisConnection: vi.fn().mockResolvedValue(true),
}));

import { checkWorkerHealth } from "../health.js";

const ENV_DATABASE_URL = "postgres://env/database";
const ENV_REDIS_URL = "redis://env/0";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", ENV_DATABASE_URL);
  vi.stubEnv("REDIS_URL", ENV_REDIS_URL);
  vi.stubEnv("SEOVISTA_PROJECT_ID", "env-project");
  dbState.connectionString = "";
  redisState.redisUrl = "";
});

describe("checkWorkerHealth partial overrides", () => {
  it("uses environment Redis and project values when only databaseUrl is overridden", async () => {
    const report = await checkWorkerHealth({ databaseUrl: "postgres://override/database" });

    expect(dbState.connectionString).toBe("postgres://override/database");
    expect(redisState.redisUrl).toBe(ENV_REDIS_URL);
    expect(report.name).toBe("env-project");
    expect(report.readiness).toBe("ready");
  });

  it("uses environment database and project values when only redisUrl is overridden", async () => {
    const report = await checkWorkerHealth({ redisUrl: "redis://override/0" });

    expect(dbState.connectionString).toBe(ENV_DATABASE_URL);
    expect(redisState.redisUrl).toBe("redis://override/0");
    expect(report.name).toBe("env-project");
  });

  it("uses environment dependency values when only projectId is overridden", async () => {
    const report = await checkWorkerHealth({ projectId: "override-project" });

    expect(dbState.connectionString).toBe(ENV_DATABASE_URL);
    expect(redisState.redisUrl).toBe(ENV_REDIS_URL);
    expect(report.name).toBe("override-project");
  });
});
