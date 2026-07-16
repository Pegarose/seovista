import { execFileSync, spawn } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInfrastructureServiceCoordinator,
  getInfrastructureServiceRecordPath,
  getInfrastructureServiceStartingRecordPath,
} from "../../scripts/infrastructure-service-coordinator.js";
import {
  createRunContext,
  getContextPath,
  getDeterministicContextPath,
  writeLifecycleContext,
} from "../../scripts/infrastructure-lifecycle-core.js";

function lockPayload(pid: number, token: string, startIdentity?: string) {
  return `${JSON.stringify({ pid, token, ...(startIdentity ? { startIdentity } : {}) })}\n`;
}

function deterministicContextPath(root: string, args: string[]) {
  if (args[0] !== "start" || typeof args[2] !== "string") throw new Error("Expected lifecycle start arguments");
  return getDeterministicContextPath(root, "seovista-dev", args[2]);
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
    let contextPath = "";
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      }
      return "";
    });

    expect(await coordinator.start()).toBe(contextPath);
    expect(await coordinator.start()).toBe(contextPath);
    expect(await coordinator.health("postgres")).toBe(true);
    expect(await coordinator.health("redis")).toBe(true);
    expect(await coordinator.stop()).toBe(true);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
      ["health", contextPath, "postgres"],
      ["health", contextPath, "redis"],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("serializes concurrent starts and shares the exact context", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      }
      return "";
    });

    const firstStart = coordinator.start();
    const secondStart = coordinator.start();
    releaseStart?.();

    const results = await Promise.all([firstStart, secondStart]);
    expect(results).toEqual([contextPath, contextPath]);
    expect(calls).toEqual([["start", "seovista-dev", expect.any(String)]]);
  });

  it("tears down the loser when ownership is claimed after lifecycle start", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const winnerContextPath = resolve(root, ".lifecycle-evidence", "winner-context.json");
    let loserContextPath = "";
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
          loserContextPath = deterministicContextPath(root, args);
          return loserContextPath;
        }
        return "";
      },
      { fileSystem },
    );

    await expect(coordinator.start()).resolves.toBe(winnerContextPath);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
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
    let freshContextPath = "";
    let lifecycleNonce = "";
    const activeRecordPath = getInfrastructureServiceRecordPath(root);
    const startingRecordPath = getInfrastructureServiceStartingRecordPath(root);
    let failStartingRemoval = false;
    let startingRemovalAttempted = false;
    let startCount = 0;
    const fileSystem = {
      unlinkSync(path: string) {
        if (path.endsWith(".cleanup") && failStartingRemoval) {
          startingRemovalAttempted = true;
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
          lifecycleNonce = args[2];
          if (startCount === 1) return (freshContextPath = deterministicContextPath(root, args));
          freshContextPath = deterministicContextPath(root, args);
          return freshContextPath;
        }
        return "";
      },
      { fileSystem },
    );

    await coordinator.start();
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const activeRecord = JSON.parse(readFileSync(activeRecordPath, "utf8"));
    const recoveryContext = createRunContext({ root, runId: "seovista-dev", nonce: lifecycleNonce });
    const startingContextPath = getContextPath(recoveryContext, root);
    writeFileSync(
      startingRecordPath,
      `${JSON.stringify({ state: "starting", contextPath: startingContextPath, operationToken: activeRecord.operationToken })}\n`,
      "utf8",
    );
    failStartingRemoval = true;
    await expect(coordinator.stop()).rejects.toThrow(/starting record removal interrupted/);
    expect(startingRemovalAttempted).toBe(true);
    expect(existsSync(activeRecordPath)).toBe(true);
    expect(JSON.parse(readFileSync(activeRecordPath, "utf8")).state).toBe("retired");
    expect(existsSync(startingRecordPath)).toBe(true);

    failStartingRemoval = false;
    mkdirSync(resolve(root, ".lifecycle-evidence"), { recursive: true });
    writeLifecycleContext(recoveryContext, startingContextPath, { root });
    await expect(coordinator.recover()).resolves.toBe(true);
    expect(existsSync(activeRecordPath)).toBe(false);
    const freshStart = await coordinator.start();
    expect(freshStart).toBe(freshContextPath);
    expect(existsSync(activeRecordPath)).toBe(true);
    expect(existsSync(startingRecordPath)).toBe(false);
  });

  it("recovers stopping ownership after teardown failure by retrying teardown", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = resolve(root, ".lifecycle-evidence", "stopping-context.json");
    const calls: string[][] = [];
    let teardownAttempts = 0;
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      }
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
      ["start", "seovista-dev", expect.any(String)],
      ["teardown", contextPath],
      ["teardown", contextPath],
    ]);
  });

  it("coordinates two real child processes so only the ownership winner remains", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const helper = resolve(root, "child-coordinator-race-helper.mjs");
    const coordinatorModule = pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-service-coordinator.js")).href;
    const lifecycleCoreModule = pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-lifecycle-core.js")).href;
    writeFileSync(
      helper,
      `import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInfrastructureServiceCoordinator } from ${JSON.stringify(coordinatorModule)};
import { getDeterministicContextPath } from ${JSON.stringify(lifecycleCoreModule)};
const [root, id, readyPath, startReleasePath, lifecycleReleasePath, resultPath] = process.argv.slice(2);
writeFileSync(readyPath, id);
while (!existsSync(startReleasePath)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
mkdirSync(root + "/.lifecycle-evidence", { recursive: true });
const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
  appendFileSync(root + "/calls.log", JSON.stringify({ id, args }) + "\\n");
  if (args[0] === "start") {
    writeFileSync(root + "/lifecycle-" + id + "-ready", id);
    while (!existsSync(lifecycleReleasePath)) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    return getDeterministicContextPath(root, "seovista-dev", args[2]);
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
    let retiredContextPath = "";
    let freshContextPath = "";
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
        if (args[0] === "start") {
          if (calls.filter(([command]) => command === "start").length === 1) {
            retiredContextPath = deterministicContextPath(root, args);
            return retiredContextPath;
          }
          freshContextPath = deterministicContextPath(root, args);
          return freshContextPath;
        }
        return "";
      },
      { fileSystem },
    );

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/record removal interrupted/);
    expect(existsSync(recordPath)).toBe(true);
    expect(JSON.parse(readFileSync(recordPath, "utf8")).state).toBe("retired");

    failRecordRemoval = false;
    const freshStart = await coordinator.start();
    expect(freshStart).toBe(freshContextPath);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
      ["teardown", retiredContextPath],
      ["start", "seovista-dev", expect.any(String)],
    ]);
  });

  it("retains a starting record after a process dies before lifecycle ownership is recorded", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const recordPath = getInfrastructureServiceRecordPath(root);
    const pendingContextPath = resolve(root, ".lifecycle-evidence", "pending-context.json");
    let freshContextPath = "";
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(getInfrastructureServiceStartingRecordPath(root), `${JSON.stringify({ state: "starting", pid: 424242, contextPath: pendingContextPath })}\n`, "utf8");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") {
          freshContextPath = deterministicContextPath(root, args);
          return freshContextPath;
        }
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
    let contextPath = "";
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
      async (args) => {
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => false, fileSystem, getProcessStartIdentity: () => "different-process" },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    expect(attempted).toBe(true);
    const result = await starting;
    expect(result).toBe(contextPath);
  });

  it("does not reclaim a matching start identity when liveness is ambiguous", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
      async (args) => {
        if (args[0] !== "start") return "";
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => undefined, getProcessStartIdentity: () => undefined, fileSystem },
    );

    const starting = coordinator.start();
    const deadline = Date.now() + 1_000;
    while (!claimAttempted && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    expect(claimAttempted).toBe(true);
    expect(existsSync(`${lockPath}.identity-a.stale`)).toBe(false);
    unlinkSync(lockPath);
    const result = await starting;
    expect(result).toBe(contextPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not reclaim a matching start identity when the pid is not alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
      async (args) => {
        if (args[0] !== "start") return "";
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => false, getProcessStartIdentity: () => "identity-a", fileSystem },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    expect(quarantined).toEqual([]);
    unlinkSync(lockPath);
    const result = await starting;
    expect(result).toBe(contextPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("reclaims a dead pid when its prior start identity can no longer be read", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
      async (args) => {
        if (args[0] !== "start") return "";
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => false, getProcessStartIdentity: () => undefined, fileSystem },
    );

    try {
      const starting = coordinator.start();
      const deadline = Date.now() + 1_000;
      while (!quarantined.some((path) => path.endsWith(".stale")) && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      expect(quarantined.filter((path) => path.endsWith(".stale"))).toHaveLength(1);
      const result = await starting;
      expect(result).toBe(contextPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reclaims a differing start identity only after the pid is not alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
      async (args) => {
        if (args[0] !== "start") return "";
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => false, getProcessStartIdentity: () => "identity-b", fileSystem },
    );

    const result = await coordinator.start();
    expect(result).toBe(contextPath);
    expect(quarantined.filter((path) => path.endsWith(".stale"))).toHaveLength(1);
    expect(quarantined.find((path) => path.endsWith(".stale"))).toMatch(/\.stale$/);
    expect(existsSync(lockPath)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not reclaim a differing start identity while the pid is alive", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "old-owner", "identity-a"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] !== "start") return "";
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => true, getProcessStartIdentity: () => "identity-b" },
    );

    const starting = coordinator.start();
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    expect(existsSync(lockPath)).toBe(true);
    unlinkSync(lockPath);
    const result = await starting;
    expect(result).toBe(contextPath);
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
import { getDeterministicContextPath } from ${JSON.stringify(pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-lifecycle-core.js")).href)};
const root = process.argv[2];
const markerReadyPath = process.argv[3];
const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
  if (args[0] === "start") {
    writeFileSync(markerReadyPath, getInfrastructureServiceStartingRecordPath(root));
    while (existsSync(markerReadyPath)) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return getDeterministicContextPath(root, "seovista-dev", args[2]);
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
        return deterministicContextPath(root, args);
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
      async (args) => {
        if (args[0] !== "start") return "";
        return deterministicContextPath(root, args);
      },
      { isProcessAlive: () => false, fileSystem },
    );

    const result = await coordinator.start();
    expect(result).toMatch(/^C:\\.*\\\.lifecycle-evidence\\seovista-dev-[0-9a-f]{12}-context\.json$/);
    expect(result).not.toBe(resolve(root, ".lifecycle-evidence", "recovered.json"));
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
      `import { createInfrastructureServiceCoordinator } from ${JSON.stringify(pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-service-coordinator.js")).href)};\nimport { getDeterministicContextPath } from ${JSON.stringify(pathToFileURL(resolve(process.cwd(), "scripts/infrastructure-lifecycle-core.js")).href)};\nconst root = process.argv[2];\nconst coordinator = createInfrastructureServiceCoordinator(root, async (args) => args[0] === "start" ? getDeterministicContextPath(root, "seovista-dev", args[2]) : "");\nawait coordinator.start();\n`,
      "utf8",
    );
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-child"), "utf8");
    execFileSync(process.execPath, [helper, root], { encoding: "utf8", windowsHide: true });
    expect(existsSync(lockPath)).toBe(false);
  });

  it("serializes same-process stop behind an in-progress start and tears down the record", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      }
      return "";
    });

    const starting = coordinator.start();
    const stopping = coordinator.stop();
    await Promise.resolve();
    releaseStart?.();

    const results = await Promise.all([starting, stopping]);
    expect(results).toEqual([contextPath, true]);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("serializes separate coordinator stop behind another instance's in-progress start", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const calls: string[][] = [];
    let releaseStart: (() => void) | undefined;
    const startBlocked = new Promise<void>((resolveStart) => {
      releaseStart = resolveStart;
    });
    const starter = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") {
        await startBlocked;
        contextPath = deterministicContextPath(root, args);
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

    const results = await Promise.all([starting, stopping]);
    expect(results).toEqual([contextPath, true]);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
      ["teardown", contextPath],
    ]);
    expect(() => readFileSync(getInfrastructureServiceRecordPath(root), "utf8")).toThrow();
  });

  it("recovers a stale lock owned by a dead process", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const calls: string[][] = [];
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    writeFileSync(lockPath, lockPayload(424242, "dead-owner"), "utf8");
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        calls.push(args);
        if (args[0] === "start") {
          contextPath = deterministicContextPath(root, args);
          return contextPath;
        }
        return "";
      },
      { isProcessAlive: () => false }
    );

    const result = await coordinator.start();
    expect(result).toBe(contextPath);
    expect(calls).toEqual([["start", "seovista-dev", expect.any(String)]]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("recovers a stale lock before tearing down an existing ownership record", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
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
    let contextPath = "";
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
          contextPath = deterministicContextPath(root, args);
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
        if (args[0] === "start") return deterministicContextPath(root, args);
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
    expect(calls).toEqual([["start", "seovista-dev", expect.any(String)]]);

    releaseWinner?.();
    const loserResult = await loserStart;
    expect(loserResult).toBe(contextPath);
    const contenderResult = await contenderStart;
    expect(contenderResult).toBe(contextPath);
    expect(calls).toEqual([["start", "seovista-dev", expect.any(String)]]);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not overwrite a replacement owner that appears during release preservation", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
        if (args[0] === "start") {
          contextPath = deterministicContextPath(root, args);
          return contextPath;
        }
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
    let contextPath = "";
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
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { processId: 1001, isProcessAlive: () => false, fileSystem }
    );

    const result = await coordinator.start();
    expect(result).toBe(contextPath);
    expect(staleQuarantinePaths).toHaveLength(1);
    failStaleCleanup = false;
    await expect(coordinator.stop()).resolves.toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not remove a replacement owner when releasing after lifecycle failure", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    const replacementPayload = lockPayload(2002, "replacement-owner");
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => {
        if (args[0] === "start") {
          contextPath = deterministicContextPath(root, args);
          return contextPath;
        }
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
    let contextPath = "";
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
        if (args[0] === "start") {
          contextPath = deterministicContextPath(root, args);
          return contextPath;
        }
        return "";
      },
      { isProcessAlive: () => true, fileSystem }
    );

    const starting = coordinator.start();
    await claimAttempted;
    expect(calls).toEqual([]);
    expect(readFileSync(lockPath, "utf8")).toBe(lockPayload(424242, "dead-owner"));
    unlinkSync(lockPath);
    const result = await starting;
    expect(result).toBe(contextPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("preserves malformed lock contents and waits instead of reclaiming", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const lockPath = resolve(root, ".lifecycle-registry", "services-infrastructure.start.lock");
    let contextPath = "";
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
      async (args) => {
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      },
      { isProcessAlive: () => false, fileSystem }
    );

    const starting = coordinator.start();
    await claimAttempted;
    expect(readFileSync(lockPath, "utf8")).toBe("not-a-pid\n");
    unlinkSync(lockPath);
    const result = await starting;
    expect(result).toBe(contextPath);
  });

  it("keeps the ownership record when exact-context teardown fails", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    let contextPath = "";
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      if (args[0] === "start") {
        contextPath = deterministicContextPath(root, args);
        return contextPath;
      }
      throw new Error("teardown failed");
    });

    await coordinator.start();
    await expect(coordinator.stop()).rejects.toThrow(/teardown failed/);
    const record = JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8")) as {
      contextPath: string;
    };
    expect(record.contextPath).toBe(contextPath);
  });

  it("writes the deterministic context path before starting lifecycle and passes the same nonce", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      const marker = JSON.parse(readFileSync(getInfrastructureServiceStartingRecordPath(root), "utf8"));
      expect(marker.contextPath).toBe(getDeterministicContextPath(root, "seovista-dev", args[2]));
      return marker.contextPath;
    }, { createLockToken: () => "owner-token" });

    const contextPath = await coordinator.start();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["start", "seovista-dev", expect.any(String)]);
    expect(contextPath).toBe(getDeterministicContextPath(root, "seovista-dev", calls[0][2]));
    expect(JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8"))).toMatchObject({
      state: "active",
      contextPath,
      operationToken: "owner-token",
    });
    expect(existsSync(getInfrastructureServiceStartingRecordPath(root))).toBe(false);
  });

  it("fails closed when lifecycle returns a context path different from the planned path", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const actualPath = resolve(root, ".lifecycle-evidence", "actual-context.json");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return actualPath;
    });

    await expect(coordinator.start()).rejects.toThrow(/context path|planned|deterministic/i);
    expect(calls).toEqual([
      ["start", "seovista-dev", expect.any(String)],
      ["teardown", actualPath],
    ]);
    expect(existsSync(getInfrastructureServiceRecordPath(root))).toBe(false);
    expect(JSON.parse(readFileSync(getInfrastructureServiceStartingRecordPath(root), "utf8"))).toMatchObject({
      state: "starting",
      contextPath: expect.stringMatching(/-context\.json$/),
    });
  });

  it("recovers an orphan marker without touching a different active owner", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const orphanPath = resolve(root, ".lifecycle-evidence", "orphan-context.json");
    const activePath = resolve(root, ".lifecycle-evidence", "active-context.json");
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    mkdirSync(resolve(root, ".lifecycle-evidence"), { recursive: true });
    writeFileSync(orphanPath, "orphan", "utf8");
    writeFileSync(startingPath, `${JSON.stringify({ state: "starting", contextPath: orphanPath, operationToken: "orphan-owner" })}\n`, "utf8");
    writeFileSync(getInfrastructureServiceRecordPath(root), `${JSON.stringify({ state: "active", contextPath: activePath, operationToken: "active-owner" })}\n`, "utf8");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return "";
    });

    await expect(coordinator.recover()).rejects.toThrow(/different active owner|manual recovery/i);

    expect(calls).toEqual([]);
    expect(existsSync(startingPath)).toBe(true);
    expect(JSON.parse(readFileSync(getInfrastructureServiceRecordPath(root), "utf8"))).toMatchObject({
      contextPath: activePath,
    });
  });

  it("recovers a marker and matching active owner together", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    mkdirSync(resolve(root, ".lifecycle-evidence"), { recursive: true });
    const recoveryContext = createRunContext({ root, runId: "recoverable-context", nonce: "abcdef123456" });
    const contextPath = getContextPath(recoveryContext, root);
    writeLifecycleContext(recoveryContext, contextPath, { root });
    writeFileSync(startingPath, `${JSON.stringify({ state: "starting", contextPath, operationToken: "owner" })}\n`, "utf8");
    writeFileSync(getInfrastructureServiceRecordPath(root), `${JSON.stringify({ state: "active", contextPath, operationToken: "owner" })}\n`, "utf8");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return "";
    });

    await expect(coordinator.recover()).resolves.toBe(true);

    expect(calls).toEqual([["teardown", contextPath]]);
    expect(existsSync(startingPath)).toBe(false);
    expect(existsSync(getInfrastructureServiceRecordPath(root))).toBe(false);
  });

  it("retains a contextless marker and refuses recovery", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const marker = { state: "starting", operationToken: "owner" };
    writeFileSync(startingPath, `${JSON.stringify(marker)}\n`, "utf8");
    const coordinator = createInfrastructureServiceCoordinator(root, async () => "");

    await expect(coordinator.recover()).rejects.toThrow(/context|recovery/i);
    expect(JSON.parse(readFileSync(startingPath, "utf8"))).toEqual(marker);
  });

  it("restores the starting marker when cleanup quarantine cannot be read", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    let failQuarantineRead = true;
    const fileSystem = {
      readFileSync(path: string, encoding: string) {
        if (failQuarantineRead && path.includes(".cleanup")) {
          const error = new Error("starting quarantine read interrupted");
          Object.assign(error, { code: "EIO" });
          throw error;
        }
        return readFileSync(path, encoding as "utf8");
      },
    };
    const coordinator = createInfrastructureServiceCoordinator(
      root,
      async (args) => deterministicContextPath(root, args),
      { fileSystem },
    );

    const contextPath = await coordinator.start();

    expect(contextPath).toMatch(/-context\.json$/);
    expect(existsSync(startingPath)).toBe(true);
    const marker = JSON.parse(readFileSync(startingPath, "utf8"));
    expect(marker).toMatchObject({ state: "starting", contextPath });
  });

  it("refuses recovery when the marker context is not trusted", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const contextPath = resolve(root, ".lifecycle-evidence", "untrusted-context.json");
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    mkdirSync(resolve(root, ".lifecycle-evidence"), { recursive: true });
    writeFileSync(contextPath, "not a lifecycle context", "utf8");
    const marker = { state: "starting", contextPath, operationToken: "owner" };
    writeFileSync(startingPath, `${JSON.stringify(marker)}\n`, "utf8");
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return "";
    });

    await expect(coordinator.recover()).rejects.toThrow(/trusted|schema|authority|context/i);
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(startingPath, "utf8"))).toEqual(marker);
  });

  it("refuses recovery when active and starting ownership tokens differ", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const context = createRunContext({ root, runId: "recovery-token", nonce: "abcdef123456" });
    const contextPath = getContextPath(context, root);
    const startingPath = getInfrastructureServiceStartingRecordPath(root);
    writeLifecycleContext(context, contextPath, { root });
    writeFileSync(
      startingPath,
      `${JSON.stringify({ state: "starting", contextPath, operationToken: "starting-owner" })}\n`,
      "utf8",
    );
    writeFileSync(
      getInfrastructureServiceRecordPath(root),
      `${JSON.stringify({ state: "active", contextPath, operationToken: "active-owner" })}\n`,
      "utf8",
    );
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      return "";
    });

    await expect(coordinator.recover()).rejects.toThrow(/ownership|token|recovery/i);
    expect(calls).toEqual([]);
    expect(existsSync(startingPath)).toBe(true);
    expect(existsSync(getInfrastructureServiceRecordPath(root))).toBe(true);
  });
});
