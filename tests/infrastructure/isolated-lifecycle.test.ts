import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSentinelEnvironment,
  buildSecretSentinelValues,
  findSecretSentinels,
  getPublicResponsePaths,
  getPublicScanPaths,
} from "../../scripts/production-sentinel.js";
import { createBuildRun } from "../../scripts/web-build-isolation.js";
import {
  assertContextAuthority,
  buildLifecycleCommands,
  buildLifecycleEnvironment,
  createRunContext,
  resourceMatchesOwnership,
  sanitizeRunIdentity,
} from "../../scripts/infrastructure-lifecycle.js";

const root = resolve(import.meta.dirname, "../..");

describe("isolated infrastructure lifecycle contract", () => {
  it("creates one bounded and unique ownership identity for every lifecycle resource", () => {
    const createdAt = "2026-07-15T00:00:00.000Z";
    const first = createRunContext({
      runId: "Seovista Run: A/B",
      nonce: "aaaaaaaaaaaa",
      ownershipToken: "a".repeat(64),
      createdAt,
    });
    const second = createRunContext({
      runId: "Seovista Run: A/B",
      nonce: "bbbbbbbbbbbb",
      ownershipToken: "b".repeat(64),
      createdAt,
    });

    expect(first.runId).toBe("seovista-run-a-b-aaaaaaaaaaaa");
    expect(second.runId).toBe("seovista-run-a-b-bbbbbbbbbbbb");
    expect(first.composeProject).toBe(first.runId);
    expect(first.databaseName).toBe(first.runId.replaceAll("-", "_"));
    expect(first.redisNamespace).toBe(`${first.runId}:`);
    expect(first.redisDatabase).toBe(0);
    expect(first.queuePrefix).toBe(`${first.runId}:queue`);
    expect(first.correlationIdPrefix).toBe(`${first.runId}-correlation-`);
    expect(first.hostPorts).toEqual({ postgres: 55432, redis: 56379 });
    expect(first.createdAt).toBe(createdAt);
    expect(first.cleanupAuthority).toBe(`context:${first.runId}`);
    expect(first.evidenceDirectory.replaceAll("\\", "/")).toContain("/.lifecycle-evidence/");
    expect(first.ownershipToken).toHaveLength(64);
    expect(first.runId).not.toBe(second.runId);
  });

  it("normalizes only safe Compose project identities", () => {
    expect(sanitizeRunIdentity("SEOVISTA__RUN.42")).toBe("seovista-run-42");
    expect(() => sanitizeRunIdentity("***")).toThrow(/identity/i);
    expect(() => sanitizeRunIdentity("a".repeat(64))).toThrow(/identity/i);
  });

  it("propagates generated database, Redis, port, and ownership values to Compose", () => {
    const context = createRunContext({
      runId: "seovista-test-propagation",
      nonce: "cccccccccccc",
      ownershipToken: "c".repeat(64),
    });

    expect(buildLifecycleEnvironment(context)).toEqual(
      expect.objectContaining({
        COMPOSE_PROJECT_NAME: context.composeProject,
        SEOVISTA_DATABASE_NAME: context.databaseName,
        SEOVISTA_REDIS_NAMESPACE: context.redisNamespace,
        SEOVISTA_POSTGRES_PORT: "55432",
        SEOVISTA_REDIS_PORT: "56379",
        SEOVISTA_OWNERSHIP_TOKEN: context.ownershipToken,
      }),
    );
  });

  it("uses project-scoped Compose commands without reconstructing cleanup ownership", () => {
    const context = createRunContext({
      runId: "seovista-test-ownership",
      nonce: "dddddddddddd",
      ownershipToken: "d".repeat(64),
    });
    const commands = buildLifecycleCommands(context);

    expect(commands.start.args).toEqual([
      "compose",
      "-p",
      context.composeProject,
      "up",
      "-d",
      "--wait",
      "postgres",
      "redis",
    ]);
    expect(commands.teardown.args).toEqual([
      "compose",
      "-p",
      context.composeProject,
      "down",
      "--volumes",
      "--remove-orphans",
      "--timeout",
      "30",
    ]);
    expect(commands.teardown.args.join(" ")).not.toContain("system prune");
  });

  it("rejects synthesized, stale, or mismatched cleanup authority", () => {
    const context = createRunContext({
      runId: "seovista-test-authority",
      nonce: "eeeeeeeeeeee",
      ownershipToken: "e".repeat(64),
    });

    expect(() => assertContextAuthority(context, context)).not.toThrow();
    expect(() => assertContextAuthority({ ...context, ownershipToken: "f".repeat(64) }, context)).toThrow(
      /authority|ownership/i,
    );
    expect(() => assertContextAuthority({ ...context, cleanupAuthority: "context:other" }, context)).toThrow(
      /authority|ownership/i,
    );
  });

  it("requires both Compose labels and the durable ownership token", () => {
    const context = createRunContext({
      runId: "seovista-test-labels",
      nonce: "ffffffffffff",
      ownershipToken: "f".repeat(64),
    });

    expect(
      resourceMatchesOwnership(
        {
          "com.docker.compose.project": context.composeProject,
          "com.seovista.lifecycle.token": context.ownershipToken,
        },
        context,
      ),
    ).toBe(true);
    expect(
      resourceMatchesOwnership(
        {
          "com.docker.compose.project": context.composeProject,
          "com.seovista.lifecycle.token": "0".repeat(64),
        },
        context,
      ),
    ).toBe(false);
    expect(resourceMatchesOwnership({}, context)).toBe(false);
  });

  it("keeps Compose loopback-bound and free of fixed global resource names", () => {
    const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");

    expect(compose).toContain('127.0.0.1:${SEOVISTA_POSTGRES_PORT:-55432}:5432');
    expect(compose).toContain('127.0.0.1:${SEOVISTA_REDIS_PORT:-56379}:6379');
    expect(compose).toContain("com.seovista.lifecycle.token: ${SEOVISTA_OWNERSHIP_TOKEN:?missing ownership token}");
    expect(compose).not.toMatch(/^\s*(container_name|name):/m);
  });

  it("makes the generated database identity available to POSTGRES_DB and the healthcheck", () => {
    const context = createRunContext({
      runId: "seovista-healthcheck-database",
      nonce: "123456789abc",
      ownershipToken: "1".repeat(64),
    });
    const environment = buildLifecycleEnvironment(context);
    const rendered = execFileSync("docker", ["compose", "--env-file", ".env.example", "config"], {
      cwd: root,
      env: { ...process.env, ...environment },
      encoding: "utf8",
    });

    expect(rendered).toContain(`POSTGRES_DB: ${context.databaseName}`);
    expect(rendered).toContain(`SEOVISTA_DATABASE_NAME: ${context.databaseName}`);
    expect(rendered).toContain("pg_isready -U seovista -d $${SEOVISTA_DATABASE_NAME:-seovista}");
  });
});

describe("production secret sentinel harness contract", () => {
  it("injects every server-secret class without public variables", () => {
    const environment = buildSentinelEnvironment();
    const sentinels = buildSecretSentinelValues();

    expect(Object.keys(sentinels)).toEqual([
      "DATABASE_URL",
      "REDIS_URL",
      "NEXTG_API_TOKEN",
      "DATAFORSEO_API_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "OBJECT_STORAGE_ACCESS_KEY",
      "OBJECT_STORAGE_SECRET_KEY",
      "EMAIL_PROVIDER_API_KEY",
      "REPORT_SIGNING_SECRET",
    ]);
    expect(environment.NEXT_PUBLIC_SITE_URL).toBe("https://seovista.com");
    expect(Object.keys(environment).some((key) => key.startsWith("NEXT_PUBLIC_") && key !== "NEXT_PUBLIC_SITE_URL")).toBe(
      false,
    );
  });

  it("detects every sentinel in public text while ignoring clean output", () => {
    const sentinels = buildSecretSentinelValues();
    const contaminated = `safe ${sentinels.DATABASE_URL} ${sentinels.REPORT_SIGNING_SECRET}`;

    expect(findSecretSentinels(contaminated, sentinels)).toEqual([
      "DATABASE_URL",
      "REPORT_SIGNING_SECRET",
    ]);
    expect(findSecretSentinels("safe public response", sentinels)).toEqual([]);
  });

  it("scans only browser-visible build artifacts and excludes server trace files", () => {
    expect(getPublicScanPaths("C:/repo/apps/web/.next").map((path) => path.replaceAll("\\", "/"))).toEqual([
      "C:/repo/apps/web/.next/static",
      "C:/repo/apps/web/.next/server/app",
    ]);
  });

  it("defines every public response surface for the runtime sentinel scan", () => {
    expect(getPublicResponsePaths()).toEqual([
      "/",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/feed.xml",
      "/manifest.webmanifest",
      "/api/health/",
    ]);
  });

  it("uses a run-unique sentinel output directory instead of the legacy profile path", () => {
    const run = createBuildRun("sentinel", {
      webDirectory: "C:/repo/apps/web",
      processId: 42,
      runId: "sentinel-42-owned",
      now: new Date("2026-07-15T00:00:00.000Z"),
    });

    expect(run.outputDirectory.replaceAll("\\", "/")).toBe(
      "C:/repo/apps/web/.next-runs/sentinel-42-owned",
    );
    expect(run.outputDirectory.replaceAll("\\", "/")).not.toContain("/.next-sentinel");
  });
});
