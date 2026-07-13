import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BUILD_PROFILES,
  BuildOwnershipError,
  acquireBuildOwnership,
  buildProfileEnvironment,
  cleanupOwnedOutput,
  createBuildRun,
  getBuildOutputDirectory,
  preflightBuildHeadroom,
  releaseBuildOwnership,
} from "../../scripts/web-build-isolation.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("web build isolation policy", () => {
  it("assigns every writer class a distinct app-local Next output directory", () => {
    const directories = Object.keys(BUILD_PROFILES).map((profile) =>
      getBuildOutputDirectory("C:/repo/apps/web", profile).replaceAll("\\", "/")
    );

    expect(Object.keys(BUILD_PROFILES)).toEqual([
      "canonical",
      "development",
      "playwright",
      "lighthouse",
      "sentinel",
      "standalone",
    ]);
    expect(new Set(directories).size).toBe(directories.length);
    expect(directories).toEqual([
      "C:/repo/apps/web/.next-canonical",
      "C:/repo/apps/web/.next-development",
      "C:/repo/apps/web/.next-playwright",
      "C:/repo/apps/web/.next-lighthouse",
      "C:/repo/apps/web/.next-sentinel",
      "C:/repo/apps/web/.next-standalone",
    ]);
  });

  it("records the run creator, command class, cleanup authority, and stale-owner policy before a writer can mutate output", () => {
    const root = mkdtempSync(join(tmpdir(), "seovista-build-isolation-"));
    const webDirectory = join(root, "apps", "web");
    mkdirSync(webDirectory, { recursive: true });
    const run = createBuildRun("canonical", {
      webDirectory,
      processId: 4242,
      now: new Date("2026-07-14T00:00:00.000Z"),
    });

    const ownership = acquireBuildOwnership(run, { isProcessAlive: () => false });
    const record = JSON.parse(readFileSync(ownership.profileLockPath, "utf8")) as Record<
      string,
      unknown
    >;

    expect(record).toMatchObject({
      runId: run.runId,
      creatorProcessId: 4242,
      commandClass: "canonical",
      createdAt: "2026-07-14T00:00:00.000Z",
      cleanupAuthority: run.cleanupAuthority,
      staleOwnerHandling: "reclaim-dead-owner-only",
    });
    expect(ownership.outputOwnerPath).toContain(".next-canonical");

    releaseBuildOwnership(ownership);
  });

  it("rejects a live conflicting writer before it touches the output directory", () => {
    const root = mkdtempSync(join(tmpdir(), "seovista-build-isolation-"));
    const webDirectory = join(root, "apps", "web");
    mkdirSync(webDirectory, { recursive: true });
    const first = createBuildRun("canonical", {
      webDirectory,
      processId: 101,
      now: new Date("2026-07-14T00:00:00.000Z"),
    });
    const second = createBuildRun("canonical", {
      webDirectory,
      processId: 202,
      now: new Date("2026-07-14T00:00:01.000Z"),
    });
    const firstOwnership = acquireBuildOwnership(first, { isProcessAlive: () => true });

    expect(() =>
      acquireBuildOwnership(second, { isProcessAlive: (processId) => processId === 101 })
    ).toThrow(BuildOwnershipError);
    expect(existsSync(getBuildOutputDirectory(webDirectory, "canonical"))).toBe(false);

    releaseBuildOwnership(firstOwnership);
  });

  it("allows a built runtime to read its owned output while the heavyweight build lock is held", () => {
    const root = mkdtempSync(join(tmpdir(), "seovista-build-isolation-"));
    const webDirectory = join(root, "apps", "web");
    mkdirSync(webDirectory, { recursive: true });
    const builder = createBuildRun("playwright", { webDirectory, processId: 101 });
    const runtime = createBuildRun("playwright", { webDirectory, processId: 202 });
    const builderOwnership = acquireBuildOwnership(builder, { isProcessAlive: () => true });

    const runtimeOwnership = acquireBuildOwnership(runtime, {
      isProcessAlive: () => true,
      serializeHeavyweight: false,
    });

    expect(runtimeOwnership.heavyweightLockPath).toBeUndefined();
    releaseBuildOwnership(runtimeOwnership);
    releaseBuildOwnership(builderOwnership);
  });

  it("reclaims only a dead stale owner and preserves a foreign output directory", () => {
    const root = mkdtempSync(join(tmpdir(), "seovista-build-isolation-"));
    const webDirectory = join(root, "apps", "web");
    const foreignOutput = join(webDirectory, ".next-foreign");
    mkdirSync(foreignOutput, { recursive: true });
    writeFileSync(join(foreignOutput, "browser-artifact.txt"), "keep");

    const first = createBuildRun("canonical", {
      webDirectory,
      processId: 101,
      now: new Date("2026-07-14T00:00:00.000Z"),
    });
    const firstOwnership = acquireBuildOwnership(first, { isProcessAlive: () => false });
    const second = createBuildRun("canonical", {
      webDirectory,
      processId: 202,
      now: new Date("2026-07-14T00:00:01.000Z"),
    });
    const secondOwnership = acquireBuildOwnership(second, { isProcessAlive: () => false });

    expect(secondOwnership.reclaimedStaleOwner).toBe(true);
    expect(existsSync(join(foreignOutput, "browser-artifact.txt"))).toBe(true);

    releaseBuildOwnership(firstOwnership);
    releaseBuildOwnership(secondOwnership);
  });

  it("cleans only output bearing the current run ownership record", () => {
    const root = mkdtempSync(join(tmpdir(), "seovista-build-isolation-"));
    const webDirectory = join(root, "apps", "web");
    mkdirSync(webDirectory, { recursive: true });
    const run = createBuildRun("playwright", {
      webDirectory,
      processId: 303,
      now: new Date("2026-07-14T00:00:00.000Z"),
    });
    const ownership = acquireBuildOwnership(run, { isProcessAlive: () => false });
    mkdirSync(ownership.outputDirectory, { recursive: true });
    writeFileSync(
      ownership.outputOwnerPath,
      JSON.stringify({
        ...run,
        profile: run.profile,
        cleanupAuthority: run.cleanupAuthority,
      })
    );
    writeFileSync(join(ownership.outputDirectory, "owned.txt"), "remove");
    const foreignOutput = join(webDirectory, ".next-browser-artifact");
    mkdirSync(foreignOutput, { recursive: true });
    writeFileSync(join(foreignOutput, "keep.txt"), "keep");

    cleanupOwnedOutput(ownership);

    expect(existsSync(ownership.outputDirectory)).toBe(false);
    expect(existsSync(join(foreignOutput, "keep.txt"))).toBe(true);
    releaseBuildOwnership(ownership);
  });

  it("adds the approved configurable heap policy and fails before build when host headroom is insufficient", () => {
    const environment = buildProfileEnvironment(
      "canonical",
      { NODE_OPTIONS: "--trace-warnings" },
      {
        heapMb: 1536,
        minHeadroomMb: 1024,
      }
    );

    expect(environment.NEXT_DIST_DIR).toBe(".next-canonical");
    expect(environment.NODE_OPTIONS).toContain("--max-old-space-size=1536");
    expect(() =>
      preflightBuildHeadroom({ availableMemoryBytes: 512 * 1024 * 1024, minHeadroomMb: 1024 })
    ).toThrow(/Insufficient host memory headroom/i);
  });

  it("routes each browser, development, Lighthouse, sentinel, and canonical writer through a named owned profile", () => {
    const root = resolve(import.meta.dirname, "..", "..");
    const read = (path: string) => readFileSync(resolve(root, path), "utf8");

    expect(read("apps/web/package.json")).toContain("run-isolated-web-command.js canonical build");
    expect(read("apps/web/package.json")).toContain("run-isolated-web-command.js development dev");
    expect(read("apps/web/playwright.config.ts")).toContain(
      "run-isolated-web-command.js playwright build"
    );
    expect(read("apps/web/playwright.dev.config.ts")).toContain(
      "run-isolated-web-command.js development dev"
    );
    expect(read("playwright.config.ts")).toContain("run-isolated-web-command.js playwright build");
    expect(read("lighthouserc.js")).toContain("run-isolated-web-command.js lighthouse build");
    expect(read("scripts/production-sentinel.js")).toContain("acquireBuildOwnership");
    expect(read("scripts/production-sentinel.js")).toContain('buildProfileEnvironment("sentinel"');
  });
});
