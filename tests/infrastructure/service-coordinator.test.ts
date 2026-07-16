import { execFileSync, spawn } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInfrastructureServiceCoordinator,
  getInfrastructureServiceRecordPath,
  getInfrastructureServiceStartingRecordPath,
} from "../../scripts/infrastructure-service-coordinator.js";

function lockPayload(pid: number, token: string, startIdentity?: string) {
  return `${JSON.stringify({ pid, token, ...(startIdentity ? { startIdentity } : {}) })}\n`;
}

function waitForChild(child: ReturnType<typeof spawn>, timeoutMs = 5_000) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveWait, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveWait({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("child process timed out"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolveWait({ code, signal });
    });
  });
}

describe("services infrastructure coordinator", () => {
  it("starts once, shares the exact emitted context across services, and retires its record after cleanup", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "exact-context.json");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") return contextPath;
      return "";
    });

    expect(await coordinator.start()).toBe(contextPath);
    expect(await coordinator.start()).toBe(contextPath);
    expect(await coordinator.health("postgres")).toBe(true);
    expect(await coordinator.health("redis")).toBe(true);
    expect(await coordinator.stop()).toBe(true);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["health", contextPath, "postgres"],
      ["health", contextPath, "redis"],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("serializes concurrent starts and shares the exact context", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "exact-context.json");
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        return contextPath;
      }
      return "";
    });

    const firstStart = coordinator.start();
    const secondStart = coordinator.start();
    releaseStart?.();

    await expect(Promise.all([firstStart, secondStart])).resolves.toEqual([contextPath, contextPath]);
    expect(calls).toEqual([["start", "seovista-dev"]]);
  });

  it("tears down the loser when ownership is claimed after lifecycle start", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const winnerContextPath = resolve(root, ".lifecycle-evidence", "winner-context.json");
    const loserContextPath = resolve(root, ".lifecycle-evidence", "loser-context.json");
    const recordPath = getInfrastructureServiceRecordPath(root);
    const calls: string[][] = [];
    let claimRace = true;
    let lifecycleStarted = false;
    const fileSystem = {
      writeFileSync(path: string, content: string, options: { flag?: string }) {
        if (path === recordPath && options.flag === "wx" && lifecycleStarted && claimRace) {
          claimRace = false;
          writeFileSync(recordPath, `${JSON.stringify({ contextPath: winnerContextPath })}\n`, "utf8");
          const error = new Error("ownership record already exists");
          Object.assign(error, { code: "EEXIST" });
          throw error;
        }
        writeFileSync(path, content, options);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") {
          lifecycleStarted = true;
          return loserContextPath;
        }
        return "";
      },
      { fileSystem },
    );

    await expect(coordinator.start()).resolves.toBe(winnerContextPath);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["teardown", loserContextPath],
    ]);
    expect(JSON.parse(readFileSync(recordPath, "utf8")).contextPath).toBe(winnerContextPath);
    expect(existsSync(getInfrastructureServiceStartingRecordPath(root))).toBe(false);
  });

  it("removes a stale starting marker that matches an existing active owner", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const activeContextPath = resolve(root, ".lifecycle-evidence", "already-active.json");
    const startingRecordPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(
      getInfrastructureServiceRecordPath(root),
      `${JSON.stringify({ state: "active", contextPath: activeContextPath, operationToken: "active-owner" })}\n`,
      "utf8",
    );
    writeFileSync(
      startingRecordPath,
      `${JSON.stringify({ state: "starting", pid: 424242, operationToken: "active-owner" })}\n`,
      "utf8",
    );
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        return "";
      },
      { isProcessAlive: () => false },
    );

    await expect(coordinator.start()).resolves.toBe(activeContextPath);
    expect(calls).toEqual([]);
    expect(existsSync(startingRecordPath)).toBe(false);
  });

  it("preserves a newer starting marker when an active owner already exists", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const activeContextPath = resolve(root, ".lifecycle-evidence", "already-active.json");
    const startingRecordPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(
      getInfrastructureServiceRecordPath(root),
      `${JSON.stringify({ state: "active", contextPath: activeContextPath, operationToken: "active-owner" })}\n`,
      "utf8",
    );
    const newerMarker = { state: "starting", pid: 424242, operationToken: "newer-owner" };
    writeFileSync(startingRecordPath, `${JSON.stringify(newerMarker)}\n`, "utf8");
    const coordinator = createInfrastructureServiceCoordinator(root, async () => "", { isProcessAlive: () => false });

    await expect(coordinator.start()).resolves.toBe(activeContextPath);
    expect(JSON.parse(readFileSync(startingRecordPath, "utf8"))).toEqual(newerMarker);
  });

  it("recovers when active cleanup removes the active record before starting-record cleanup fails", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const activeContextPath = resolve(root, ".lifecycle-evidence", "active-context.json");
    const freshContextPath = resolve(root, ".lifecycle-evidence", "fresh-context.json");
    const activeRecordPath = getInfrastructureServiceRecordPath(root);
    const startingRecordPath = getInfrastructureServiceStartingRecordPath(root);
    let failStartingRemoval = false;
    let startCount = 0;
    const fileSystem = {
      unlinkSync(path: string) {
        if (path === startingRecordPath && failStartingRemoval) {
          const error = new Error("starting record removal interrupted");
          Object.assign(error, { code: "EIO" });
          throw error;
        }
        unlinkSync(path);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] === "start") {
          startCount += 1;
          return startCount === 1 ? activeContextPath : freshContextPath;
        }
        return "";
      },
      { fileSystem },
    );

    await coordinator.start();
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(startingRecordPath, `${JSON.stringify({ state: "starting", operationToken: "stale" })}\n`, "utf8");
    failStartingRemoval = true;
    await expect(coordinator.stop()).rejects.toThrow(/starting record removal interrupted/);
    expect(existsSync(activeRecordPath)).toBe(true);
    expect(JSON.parse(readFileSync(activeRecordPath, "utf8")).state).toBe("retired");
    expect(existsSync(startingRecordPath)).toBe(true);

    failStartingRemoval = false;
    await expect(coordinator.start()).resolves.toBe(freshContextPath);
    expect(existsSync(activeRecordPath)).toBe(true);
    expect(existsSync(startingRecordPath)).toBe(false);
  });

  it("recovers stopping ownership after teardown failure by retrying teardown", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "stopping-context.json");
    const calls: string[][] = [];
    let teardownAttempts = 0;
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") return contextPath;
      teardownAttempts += 1;
      if (teardownAttempts === 1) throw new Error("teardown interrupted");
      return "";
    });

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/teardown interrupted/);
    expect(JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8"))).toMatchObject({
      state: "stopping",
      contextPath,
    });

    await expect(coordinator.stop()).resolves.toBe(true);
    expect(existsSync(getInfrastructureServiceRecordPath(root))).toBe(false);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["teardown", contextPath],
      ["teardown", contextPath],
    ]);
  });

  it("coordinates two real child processes so only the ownership winner remains", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const helper = resolve(root, "child-coordinator-race-helper.mjs");
    const coordinatorModule = pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-service-coordinator.js")).href;
    writeFileSync(
      helper,
      `import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInfrastructureServiceCoordinator } from ${JSON.stringify(coordinatorModule)};
const [root, id, readyPath, startReleasePath, lifecycleReleasePath, resultPath] = process.argv.slice(2);
const contextPath = root + "/.lifecycle-evidence/" + id + "-context.json";
writeFileSync(readyPath, id);
while (!existsSync(startReleasePath)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
mkdirSync(root + "/.lifecycle-evidence", { recursive: true });
const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
  appendFileSync(root + "/calls.log", JSON.stringify({ id, args }) + "\\n");
  if (args[0] === "start") {
    writeFileSync(root + "/lifecycle-" + id + "-ready", id);
    while (!existsSync(lifecycleReleasePath)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    return contextPath;
  }
  return "";
});
try {
  const context = await coordinator.start();
  writeFileSync(resultPath, JSON.stringify({ id, context }));
} catch (error) {
  writeFileSync(resultPath, JSON.stringify({ id, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
`,
      "utf8",
    );
    const readyA = resolve(root, "ready-a");
    const readyB = resolve(root, "ready-b");
    const startReleasePath = resolve(root, "start-release");
    const lifecycleReadyA = resolve(root, "lifecycle-a-ready");
    const lifecycleReadyB = resolve(root, "lifecycle-b-ready");
    const lifecycleReleasePath = resolve(root, "lifecycle-release");
    const resultA = resolve(root, "result-a.json");
    const resultB = resolve(root, "result-b.json");
    const childA = spawn(process.execPath, [helper, root, "a", readyA, startReleasePath, lifecycleReleasePath, resultA], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const childB = spawn(process.execPath, [helper, root, "b", readyB, startReleasePath, lifecycleReleasePath, resultB], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let childErrors = "";
    childA.stderr?.on("data", (chunk) => { childErrors += chunk.toString(); });
    childB.stderr?.on("data", (chunk) => { childErrors += chunk.toString(); });
    try {
      const deadline = Date.now() + 5_000;
      while ((!existsSync(readyA) || !existsSync(readyB)) && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      expect(existsSync(readyA), childErrors).toBe(true);
      expect(existsSync(readyB), childErrors).toBe(true);
      writeFileSync(startReleasePath, "go");
      const lifecycleDeadline = Date.now() + 5_000;
      while ((!existsSync(lifecycleReadyA) || !existsSync(lifecycleReadyB)) && Date.now() < lifecycleDeadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      expect(existsSync(lifecycleReadyA) || existsSync(lifecycleReadyB), childErrors).toBe(true);
      writeFileSync(lifecycleReleasePath, "go");
      const exits = await Promise.all([waitForChild(childA), waitForChild(childB)]);
      expect(exits.map(({ code }) => code), childErrors).toEqual([0, 0]);

      const results = [JSON.parse(readFileSync(resultA, "utf8")), JSON.parse(readFileSync(resultB, "utf8"))];
      expect(results.filter((result) => result.context).length).toBe(2);
      const activeRecord = JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8"));
      expect(activeRecord.state).toBe("active");
      expect(results.map((result) => result.context)).toContain(activeRecord.contextPath);
      const calls = readFileSync(resolve(root, "calls.log"), "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      expect(calls.filter(({ args }) => args[0] === "start")).toHaveLength(1);
      expect(calls.filter(({ args }) => args[0] === "teardown")).toHaveLength(0);
      expect(results.every((result) => result.context === activeRecord.contextPath)).toBe(true);
    } finally {
      childA.kill();
      childB.kill();
      await Promise.allSettled([waitForChild(childA), waitForChild(childB)]);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not return a retired record after teardown completed before record removal", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const retiredContextPath = resolve(root, ".lifecycle-evidence", "retired-context.json");
    const freshContextPath = resolve(root, ".lifecycle-evidence", "fresh-context.json");
    const recordPath = getInfrastructureServiceRecordPath(root);
    let failRecordRemoval = true;
    const fileSystem = {
      unlinkSync(path: string) {
        if (path === recordPath && failRecordRemoval) {
          const error = new Error("record removal interrupted");
          Object.assign(error, { code: "EIO" });
          throw error;
        }
        unlinkSync(path);
      },
    };
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") return calls.filter(([command]) => command === "start").length === 1 ? retiredContextPath : freshContextPath;
        return "";
      },
      { fileSystem },
    );

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/record removal interrupted/);
    expect(existsSync(recordPath)).toBe(true);
    expect(JSON.parse(readFileSync(recordPath, "utf8")).state).toBe("retired");

    failRecordRemoval = false;
    await expect(coordinator.start()).resolves.toBe(freshContextPath);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["teardown", retiredContextPath],
      ["start", "seovista-dev"],
    ]);
  });

  it("retains a starting record after a process dies before lifecycle ownership is recorded", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const recordPath = getInfrastructureServiceRecordPath(root);
    const pendingContextPath = resolve(root, ".lifecycle-evidence", "pending-context.json");
    const freshContextPath = resolve(root, ".lifecycle-evidence", "fresh-context.json");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(getInfrastructureServiceStartingRecordPath(root), `${JSON.stringify({ state: "starting", pid: 424242, contextPath: pendingContextPath })}\n`, "utf8");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") return freshContextPath;
        return "";
      },
      { isProcessAlive: () => false },
    );

    await expect(coordinator.start()).rejects.toThrow(/starting|recovery|ownership/i);
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(getInfrastructureServiceStartingRecordPath(root), "utf8")).state).toBe("starting");
  });

  it("does not reclaim a live pid when its start identity cannot be proven", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, `${JSON.stringify({ pid: 424242, token: "unsafe/..\\\\token" })}\n`, "utf8");
    let attempted = false;
    const fileSystem = {
      writeFileSync(path: string, content: string, options: { flag?: string }) {
        if (path === lockPath && options.flag === "wx" && existsSync(lockPath)) {
          attempted = true;
          const error = new Error("lock exists");
          Object.assign(error, { code: "EEXIST" });
          throw error;
        }
        writeFileSync(path, content, options);
      },
      renameSync,
      linkSync,
      unlinkSync,
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async () => resolve(root, ".lifecycle-evidence", "should-not-start.json"),
      { isProcessAlive: () => false, fileSystem, getProcessStartIdentity: () => "different-process" },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    expect(attempted).toBe(true);
    await expect(starting).resolves.toBe(resolve(root, ".lifecycle-evidence", "should-not-start.json"));
  });

  it("does not reclaim a matching start identity when liveness is ambiguous", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "identity-ambiguous.json");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "same-owner", "identity-a"), "utf8");
    let claimAttempted = false;
    const fileSystem = {
      writeFileSync(path: string, content: string, options: { flag?: string }) {
        if (path === lockPath && options.flag === "wx" && existsSync(lockPath)) {
          claimAttempted = true;
          const error = new Error("lock exists");
          Object.assign(error, { code: "EEXIST" });
          throw error;
        }
        writeFileSync(path, content, options);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => (args[0] === "start" ? contextPath : ""),
      { isProcessAlive: () => undefined, getProcessStartIdentity: () => undefined, fileSystem },
    );

    const starting = coordinator.start();
    const deadline = Date.now() + 1_000;
    while (!claimAttempted && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    expect(claimAttempted).toBe(true);
    expect(existsSync(`${lockPath}.identity-a.stale`)).toBe(false);
    unlinkSync(lockPath);
    await expect(starting).resolves.toBe(contextPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not reclaim a matching start identity when the pid is not alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "identity-matches.json");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "same-owner", "identity-a"), "utf8");
    const quarantined: string[] = [];
    const fileSystem = {
      renameSync(source: string, destination: string) {
        quarantined.push(destination);
        renameSync(source, destination);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => (args[0] === "start" ? contextPath : ""),
      { isProcessAlive: () => false, getProcessStartIdentity: () => "identity-a", fileSystem },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    expect(quarantined).toEqual([]);
    unlinkSync(lockPath);
    await expect(starting).resolves.toBe(contextPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("reclaims a differing start identity only after the pid is not alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "identity-reclaimed.json");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "old-owner", "identity-a"), "utf8");
    const quarantined: string[] = [];
    const fileSystem = {
      renameSync(source: string, destination: string) {
        quarantined.push(destination);
        renameSync(source, destination);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => (args[0] === "start" ? contextPath : ""),
      { isProcessAlive: () => false, getProcessStartIdentity: () => "identity-b", fileSystem },
    );

    await expect(coordinator.start()).resolves.toBe(contextPath);
    expect(quarantined.filter((path) => path.endsWith(".stale"))).toHaveLength(1);
    expect(quarantined.find((path) => path.endsWith(".stale"))).toMatch(/\.stale$/);
    expect(existsSync(lockPath)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not reclaim a differing start identity while the pid is alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "identity-live.json");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "old-owner", "identity-a"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => (args[0] === "start" ? contextPath : ""),
      { isProcessAlive: () => true, getProcessStartIdentity: () => "identity-b" },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    expect(existsSync(lockPath)).toBe(true);
    unlinkSync(lockPath);
    await expect(starting).resolves.toBe(contextPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a duplicate start after a child dies between marker and active ownership", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const helper = resolve(root, "child-coordinator-crash-helper.mjs");
    const coordinatorModule = pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-service-coordinator.js")).href;
    const markerReadyPath = resolve(root, "marker-ready");
    writeFileSync(
      helper,
      `import { existsSync, writeFileSync } from "node:fs";
import { createInfrastructureServiceCoordinator, getInfrastructureServiceStartingRecordPath } from ${JSON.stringify(coordinatorModule)};
const root = process.argv[2];
const markerReadyPath = process.argv[3];
const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
  if (args[0] === "start") {
    writeFileSync(markerReadyPath, getInfrastructureServiceStartingRecordPath(root));
    while (existsSync(markerReadyPath)) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return root + "/.lifecycle-evidence/crashed-context.json";
});
await coordinator.start();
`,
      "utf8",
    );
    const child = spawn(process.execPath, [helper, root, markerReadyPath], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let childErrors = "";
    child.stderr?.on("data", (chunk) => { childErrors += chunk.toString(); });
    try {
      const deadline = Date.now() + 5_000;
      while (!existsSync(markerReadyPath) && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      }
      expect(existsSync(markerReadyPath), childErrors).toBe(true);
      expect(existsSync(getInfrastructureServiceStartingRecordPath(root))).toBe(true);
      expect(existsSync(getInfrastructureServiceRecordPath(root))).toBe(false);
      child.kill();
      await expect(waitForChild(child)).resolves.toMatchObject({ signal: "SIGTERM" });

      const freshCalls: string[][] = [];
      const fresh = createInfrastructureServiceCoordinator(root, async (args) => {
        freshCalls.push(args);
        return resolve(root, ".lifecycle-evidence", "duplicate-context.json");
      });
      await expect(fresh.start()).rejects.toThrow(/starting|recovery|ownership/i);
      expect(freshCalls).toEqual([]);
      expect(JSON.parse(readFileSync(getInfrastructureServiceStartingRecordPath(root), "utf8"))).toMatchObject({ state: "starting" });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await Promise.allSettled([waitForChild(child)]);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("recovers a stale lock using a fresh quarantine filename", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, `${JSON.stringify({ pid: 424242, token: "unsafe/..\\\\token" })}\n`, "utf8");
    const quarantined: string[] = [];
    const fileSystem = {
      renameSync(source: string, destination: string) {
        quarantined.push(destination);
        renameSync(source, destination);
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => (args[0] === "start" ? resolve(root, ".lifecycle-evidence", "recovered.json") : ""),
      { isProcessAlive: () => false, fileSystem },
    );

    await expect(coordinator.start()).resolves.toBe(resolve(root, ".lifecycle-evidence", "recovered.json"));
    const staleQuarantine = quarantined.find((path) => path.endsWith(".stale"));
    expect(staleQuarantine).toBeDefined();
    expect(resolve(staleQuarantine as string)).toBe(staleQuarantine);
    expect(staleQuarantine).not.toContain("unsafe");
  });

  it("recovers a stale lock across real child-process boundaries", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const helper = resolve(root, "child-coordinator-helper.mjs");
    writeFileSync(
      helper,
      `import { createInfrastructureServiceCoordinator } from ${JSON.stringify(pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-service-coordinator.js")).href)};\nconst root = process.argv[2];\nconst coordinator = createInfrastructureServiceCoordinator(root, async (args) => args[0] === "start" ? root + "/child-context.json" : "");\nawait coordinator.start();\n`,
      "utf8",
    );
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-child"), "utf8");
    execFileSync(process.execPath, [helper, root], { encoding: "utf8", windowsHide: true });
    expect(existsSync(lockPath)).toBe(false);
  });

  it("serializes same-process stop behind an in-progress start and tears down the record", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "same-process-context.json");
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        return contextPath;
      }
      return "";
    });

    const starting = coordinator.start();
    const stopping = coordinator.stop();
    await Promise.resolve();
    releaseStart?.();

    await expect(Promise.all([starting, stopping])).resolves.toEqual([contextPath, true]);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("serializes separate coordinator stop behind another instance's in-progress start", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "separate-instance-context.json");
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const starter = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        return contextPath;
      }
      return "";
    });
    const stopper = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return "";
    });

    const starting = starter.start();
    const stopping = stopper.stop();
    await Promise.resolve();
    releaseStart?.();

    await expect(Promise.all([starting, stopping])).resolves.toEqual([contextPath, true]);
    expect(calls).toEqual([
      ["start", "seovista-dev"],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("recovers a stale lock owned by a dead process", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "recovered-context.json");
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const calls: string[][] = [];
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") return contextPath;
        return "";
      },
      { isProcessAlive: () => false }
    );

    await expect(coordinator.start()).resolves.toBe(contextPath);
    expect(calls).toEqual([["start", "seovista-dev"]]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("recovers a stale lock before tearing down an existing ownership record", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "stale-stop-context.json");
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const calls: string[][] = [];
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(getInfrastructureServiceRecordPath(root), `${JSON.stringify({ contextPath })}\n`, "utf8");
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        return "";
      },
      { isProcessAlive: () => false }
    );

    await expect(coordinator.stop()).resolves.toBe(true);
    expect(calls).toEqual([["teardown", contextPath]]);
    expect(existsSync(lockPath)).toBe(false);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("allows only one contender to recover a stale lock and preserves the winner during the race", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "race-winner-context.json");
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const calls: string[][] = [];
    let releaseWinner: (() => void) | undefined;
    let resolveWinnerStarted: (() => void) | undefined;
    const winnerStarted = new Promise<void>((resolveStarted) => {
      resolveWinnerStarted = resolveStarted;
    });
    const winnerRelease = new Promise<void>((resolveRelease) => {
      releaseWinner = resolveRelease;
    });
    let resolveQuarantineCleaned: (() => void) | undefined;
    const quarantineCleaned = new Promise<void>((resolveCleaned) => {
      resolveQuarantineCleaned = resolveCleaned;
    });
    let contender: ReturnType<typeof createInfrastructureServiceCoordinator>;
    let contenderStart: Promise<string> | undefined;
    const fileSystem = {
      linkSync,
      unlinkSync(path: string) {
        unlinkSync(path);
        if (path.endsWith(".stale")) resolveQuarantineCleaned?.();
      },
    };
    const isProcessAlive = (processId: number) => processId !== 424242;
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    contender = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") {
          resolveWinnerStarted?.();
          await winnerRelease;
          return contextPath;
        }
        return "";
      },
      {
        processId: 1002,
        isProcessAlive,
        fileSystem,
      }
    );
    const loser = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") return resolve(root, ".lifecycle-evidence", "loser-context.json");
        return "";
      },
      {
        processId: 1001,
        isProcessAlive,
        fileSystem,
        afterStaleLockQuarantine: () => {
          contenderStart = contender.start();
        },
      }
    );

    const loserStart = loser.start();
    await winnerStarted;
    await quarantineCleaned;
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toMatchObject({ pid: 1002 });
    expect(calls).toEqual([["start", "seovista-dev"]]);

    releaseWinner?.();
    await expect(loserStart).resolves.toBe(contextPath);
    await expect(contenderStart).resolves.toBe(contextPath);
    expect(calls).toEqual([["start", "seovista-dev"]]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not overwrite a replacement owner that appears during release preservation", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "release-mismatch-context.json");
    const replacementPayload = lockPayload(2002, "replacement-owner");
    let releaseReadCount = 0;
    let replacementClaimed = false;
    let resolveReplacementClaimed: (() => void) | undefined;
    const replacementClaim = new Promise<void>((resolveClaimed) => {
      resolveReplacementClaimed = resolveClaimed;
    });
    let quarantinePath: string | undefined;
    const fileSystem = {
      renameSync(source: string, destination: string) {
        renameSync(source, destination);
        if (destination.endsWith(".release")) quarantinePath = destination;
      },
      readFileSync(path: string, encoding: "utf8") {
        if (path.endsWith(".release") && !replacementClaimed && releaseReadCount++ > 0) {
          writeFileSync(lockPath, replacementPayload, { encoding: "utf8", flag: "wx" });
          replacementClaimed = true;
          resolveReplacementClaimed?.();
        }
        return readFileSync(path, encoding);
      },
      linkSync,
      unlinkSync,
    };
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] === "start") return contextPath;
        throw new Error("teardown failed");
      },
      { processId: 1001, isProcessAlive: () => true, fileSystem }
    );

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/teardown failed/);
    await replacementClaim;
    expect(quarantinePath).toBeDefined();
    expect(readFileSync(lockPath, "utf8")).toBe(replacementPayload);
    expect(() => readFileSync(quarantinePath as string, "utf8")).toThrow();
  });

  it("restores a valid quarantined payload when canonical is absent", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const ownerPayload = lockPayload(1001, "owner");
    const replacementPayload = lockPayload(2002, "replacement-owner");
    let releaseQuarantineRead = false;
    let restoredPayload: string | undefined;
    const fileSystem = {
      readFileSync(path: string, encoding: "utf8") {
        if (path.endsWith(".release") && !releaseQuarantineRead) {
          releaseQuarantineRead = true;
          return replacementPayload;
        }
        return readFileSync(path, encoding);
      },
      renameSync(source: string, destination: string) {
        renameSync(source, destination);
      },
      linkSync(source: string, destination: string) {
        expect(existsSync(destination)).toBe(false);
        restoredPayload = readFileSync(source, "utf8");
        linkSync(source, destination);
      },
      unlinkSync,
    };
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, ownerPayload, "utf8");
    writeFileSync(getInfrastructureServiceRecordPath(root), `${JSON.stringify({ contextPath: resolve(root, ".lifecycle-evidence", "context.json") })}\n`, "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async () => "",
      { processId: 1001, createLockToken: () => "owner", fileSystem }
    );

    await expect(coordinator.stop()).resolves.toBe(true);
    expect(restoredPayload).toBe(ownerPayload);
    expect(readFileSync(lockPath, "utf8")).toBe(ownerPayload);
  });

  it("does not strand a claimed lock when stale quarantine cleanup fails", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const contextPath = resolve(root, ".lifecycle-evidence", "cleanup-failure-context.json");
    const staleQuarantinePaths: string[] = [];
    let resolveCleanupAttempted: (() => void) | undefined;
    const cleanupAttempted = new Promise<void>((resolveAttempted) => {
      resolveCleanupAttempted = resolveAttempted;
    });
    let failStaleCleanup = true;
    const fileSystem = {
      unlinkSync(path: string) {
        if (failStaleCleanup && path.endsWith(".stale")) {
          staleQuarantinePaths.push(path);
          resolveCleanupAttempted?.();
          const error = new Error("cleanup failed");
          Object.assign(error, { code: "EACCES" });
          throw error;
        }
        unlinkSync(path);
      },
      linkSync,
    };
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] !== "start") return "";
        await cleanupAttempted;
        expect(readFileSync(lockPath, "utf8")).toContain('"pid":1001');
        return contextPath;
      },
      { processId: 1001, isProcessAlive: () => false, fileSystem }
    );

    await expect(coordinator.start()).resolves.toBe(contextPath);
    expect(staleQuarantinePaths).toHaveLength(1);
    failStaleCleanup = false;
    await expect(coordinator.stop()).resolves.toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not remove a replacement owner when releasing after lifecycle failure", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "release-mismatch-context.json");
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const replacementPayload = lockPayload(2002, "replacement-owner");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] === "start") return contextPath;
        writeFileSync(lockPath, replacementPayload, "utf8");
        throw new Error("teardown failed");
      },
      { processId: 1001, isProcessAlive: () => true }
    );

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/teardown failed/);
    expect(readFileSync(lockPath, "utf8")).toBe(replacementPayload);
  });

  it("waits for an active lock instead of reclaiming it", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "released-context.json");
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const calls: string[][] = [];
    let resolveClaimAttempted: (() => void) | undefined;
    const claimAttempted = new Promise<void>((resolveAttempted) => {
      resolveClaimAttempted = resolveAttempted;
    });
    const fileSystem = {
      writeFileSync(path: string, content: string, options: { flag?: string }) {
        if (path === lockPath && options.flag === "wx") {
          resolveClaimAttempted?.();
          if (existsSync(path)) {
            const error = new Error("active lock exists");
            Object.assign(error, { code: "EEXIST" });
            throw error;
          }
        }
        writeFileSync(path, content, options);
      },
    };
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") return contextPath;
        return "";
      },
      { isProcessAlive: () => true, fileSystem }
    );

    const starting = coordinator.start();
    await claimAttempted;
    expect(calls).toEqual([]);
    expect(readFileSync(lockPath, "utf8")).toBe(lockPayload(424242, "dead-owner"));
    unlinkSync(lockPath);
    await expect(starting).resolves.toBe(contextPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("preserves malformed lock contents and waits instead of reclaiming", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let resolveClaimAttempted: (() => void) | undefined;
    const claimAttempted = new Promise<void>((resolveAttempted) => {
      resolveClaimAttempted = resolveAttempted;
    });
    const fileSystem = {
      writeFileSync(path: string, content: string, options: { flag?: string }) {
        if (path === lockPath && options.flag === "wx") {
          resolveClaimAttempted?.();
          if (existsSync(path)) {
            const error = new Error("malformed lock exists");
            Object.assign(error, { code: "EEXIST" });
            throw error;
          }
        }
        writeFileSync(path, content, options);
      },
    };
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, "not-a-pid\n", "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async () => resolve(root, ".lifecycle-evidence", "should-not-start.json"),
      { isProcessAlive: () => false, fileSystem }
    );

    const starting = coordinator.start();
    await claimAttempted;
    expect(readFileSync(lockPath, "utf8")).toBe("not-a-pid\n");
    unlinkSync(lockPath);
    await expect(starting).resolves.toBe(resolve(root, ".lifecycle-evidence", "should-not-start.json"));
  });

  it("keeps the ownership record when exact-context teardown fails", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "exact-context.json");
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      if (args[0] === "start") return contextPath;
      throw new Error("teardown failed");
    });

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/teardown failed/);
    const record = JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8")) as {
      contextPath: string;
    };
    expect(record.contextPath).toBe(contextPath);
  });
});
