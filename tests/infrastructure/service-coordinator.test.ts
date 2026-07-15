import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInfrastructureServiceCoordinator,
  getInfrastructureServiceRecordPath,
} from "../../scripts/infrastructure-service-coordinator.js";

function lockPayload(pid: number, token: string) {
  return `${JSON.stringify({ pid, token })}\n`;
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

  it("tears down a context when an atomic ownership record claim loses a race", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-services-"));
    const winnerContextPath = resolve(root, ".lifecycle-evidence", "winner-context.json");
    const loserContextPath = resolve(root, ".lifecycle-evidence", "loser-context.json");
    const recordPath = getInfrastructureServiceRecordPath(root);
    const calls: string[][] = [];
    const coordinator = createInfrastructureServiceCoordinator(root, async (args) => {
      calls.push(args);
      if (args[0] === "start") return loserContextPath;
      return "";
    });

    mkdirSync(resolve(root, ".lifecycle-registry"), { recursive: true });
    const competingRecord = JSON.stringify({ contextPath: winnerContextPath });
    writeFileSync(recordPath, `${competingRecord}\n`, "utf8");

    await expect(coordinator.start()).resolves.toBe(winnerContextPath);
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(recordPath, "utf8")).contextPath).toBe(winnerContextPath);
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
