import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInfrastructureServiceCoordinator,
  getInfrastructureServiceRecordPath,
} from "../../scripts/infrastructure-service-coordinator.js";

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
