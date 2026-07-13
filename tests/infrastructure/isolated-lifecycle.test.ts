import { describe, expect, it } from "vitest";
import {
  buildSentinelEnvironment,
  buildSecretSentinelValues,
  findSecretSentinels,
  getPublicResponsePaths,
  getPublicScanPaths,
  getSentinelDistDirectory,
} from "../../scripts/production-sentinel.js";
import {
  buildLifecycleCommands,
  createRunContext,
  isOwnedResource,
  sanitizeRunIdentity,
} from "../../scripts/infrastructure-lifecycle.js";

describe("isolated infrastructure lifecycle contract", () => {
  it("creates one bounded ownership identity for Compose, database, Redis, queue, and correlation resources", () => {
    const context = createRunContext({ runId: "Seovista Run: A/B" });

    expect(context.projectId).toBe("seovista-run-a-b");
    expect(context.composeProject).toBe(context.projectId);
    expect(context.databaseName).toBe(context.projectId);
    expect(context.redisNamespace).toBe(context.projectId);
    expect(context.queueName).toBe(`${context.projectId}-ping`);
    expect(context.correlationId).toMatch(new RegExp(`^${context.projectId}-`));
  });

  it("normalizes only safe Compose project identities", () => {
    expect(sanitizeRunIdentity("SEOVISTA__RUN.42")).toBe("seovista-run-42");
    expect(() => sanitizeRunIdentity("***")).toThrow(/identity/i);
    expect(() => sanitizeRunIdentity("a".repeat(64))).toThrow(/identity/i);
  });

  it("uses project-scoped Compose lifecycle commands and only owned teardown", () => {
    const context = createRunContext({ runId: "seovista-test-ownership" });
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
    expect(isOwnedResource(`${context.projectId}-postgres-1`, context)).toBe(true);
    expect(isOwnedResource("other-project-postgres-1", context)).toBe(false);
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

  it("uses a sentinel-owned Next output directory", () => {
    expect(getSentinelDistDirectory("C:/repo/apps/web").replaceAll("\\", "/")).toBe(
      "C:/repo/apps/web/.next-sentinel",
    );
  });
});
