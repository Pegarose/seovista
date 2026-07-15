import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLifecycleController } from "../../scripts/infrastructure-lifecycle-cli.js";
import { readTrustedLifecycleContext } from "../../scripts/infrastructure-lifecycle-core.js";

function inventory() {
  return {
    containers: [],
    networks: [],
    volumes: [],
    rejectedProjectResources: { containers: [], networks: [], volumes: [] },
    listeners: [],
    databases: [],
    redisNamespaces: [],
    queues: [],
    unrelatedFingerprints: { containers: [], networks: [], volumes: [] },
  };
}

describe("lifecycle cleanup failure reporting", () => {
  it("preserves the startup cause, attaches cleanup failure, writes evidence, and leaves authority active", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-start-cleanup-failure-"));
    const controller = createLifecycleController(root, {
      inspectResources: vi.fn().mockResolvedValueOnce(inventory()).mockRejectedValueOnce(new Error("cleanup inventory failed")),
      executeCommand: vi.fn().mockRejectedValueOnce(new Error("compose startup failed")),
    });

    let failure: unknown;
    try {
      await controller.start("failed-start-cleanup");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/compose startup failed/);
    expect((failure as Error & { cleanupError?: Error }).cleanupError?.message).toMatch(/cleanup inventory failed/);

    const activeRun = controller.getActiveRun();
    expect(activeRun).toBeDefined();
    const evidencePath = resolve(activeRun!.context.evidenceDirectory, "failed-start-cleanup-error.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { inventory: { startupError: string; cleanupError: string } };
    expect(evidence.inventory.startupError).toMatch(/compose startup failed/);
    expect(evidence.inventory.cleanupError).toMatch(/cleanup inventory failed/);
    expect(readTrustedLifecycleContext(activeRun!.contextPath, root).status).toBe("active");
  });

  it("rejects interruption cleanup failures and records them for manual recovery", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-interrupt-cleanup-failure-"));
    const inspectResources = vi.fn()
      .mockResolvedValueOnce(inventory())
      .mockResolvedValueOnce(inventory())
      .mockResolvedValueOnce(inventory());
    const executeCommand = vi.fn()
      .mockResolvedValueOnce("")
      .mockRejectedValueOnce(new Error("signal teardown failed"));
    const controller = createLifecycleController(root, { inspectResources, executeCommand });
    await controller.start("signal-cleanup");

    await expect(controller.interruptCleanup()).rejects.toThrow(/signal teardown failed/);

    const activeRun = controller.getActiveRun();
    expect(activeRun).toBeDefined();
    const evidencePath = resolve(activeRun!.context.evidenceDirectory, "interrupt-cleanup-error.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { inventory: { cleanupError: string } };
    expect(evidence.inventory.cleanupError).toMatch(/signal teardown failed/);
    expect(readTrustedLifecycleContext(activeRun!.contextPath, root).status).toBe("active");
  });

  it("compares unrelated fingerprints before retiring trusted authority", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-fingerprint-mismatch-"));
    const before = inventory();
    before.unrelatedFingerprints.volumes = ["owned-volume", "legacy-volume"];
    before.volumes = ["owned-volume"];
    const after = inventory();
    const controller = createLifecycleController(root, {
      inspectResources: vi.fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after),
      executeCommand: vi.fn().mockResolvedValue(""),
    });
    const contextPath = await controller.start("fingerprint-mismatch");

    await expect(controller.teardown(contextPath)).rejects.toThrow(/unrelated.*changed|fingerprint/i);
    expect(readTrustedLifecycleContext(contextPath, root).status).toBe("active");
  });

  it("does not exclude an unlabeled same-prefix resource from unrelated fingerprints", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-same-prefix-fingerprint-"));
    const startInventory = inventory();
    const controller = createLifecycleController(root, {
      inspectResources: vi.fn()
        .mockResolvedValueOnce(startInventory)
        .mockResolvedValueOnce(startInventory)
        .mockImplementationOnce(async (context: { composeProject: string }) => ({
          ...inventory(),
          containers: [`${context.composeProject}-postgres-1`],
          unrelatedFingerprints: {
            containers: [`${context.composeProject}-postgres-1`, `${context.composeProject}-unlabeled`],
            networks: [],
            volumes: [],
          },
        }))
        .mockResolvedValueOnce(inventory()),
      executeCommand: vi.fn().mockResolvedValue(""),
    });
    const contextPath = await controller.start("same-prefix-fingerprint");

    await expect(controller.teardown(contextPath)).rejects.toThrow(/unrelated.*changed|fingerprint/i);
    expect(readTrustedLifecycleContext(contextPath, root).status).toBe("active");
  });

  it("waits for startup before interrupt teardown and never executes after authority retires", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "seovista-serialized-interrupt-"));
    let releaseFirstInspection!: () => void;
    const deferredInspection = new Promise<void>((resolveInspection) => {
      releaseFirstInspection = resolveInspection;
    });
    let startupInspectionEnteredResolve!: () => void;
    const startupInspectionEntered = new Promise<void>((resolveEntered) => {
      startupInspectionEnteredResolve = resolveEntered;
    });
    let inspectionCount = 0;
    const inspectResources = vi.fn().mockImplementation(async () => {
      inspectionCount += 1;
      if (inspectionCount === 1) {
        startupInspectionEnteredResolve();
        await deferredInspection;
      }
      return inventory();
    });
    const operations: string[] = [];
    const executeCommand = vi.fn().mockImplementation(async (_root: string, _log: unknown[], command: string) => {
      operations.push(command);
      return "";
    });
    const controller = createLifecycleController(root, { inspectResources, executeCommand });

    const startup = controller.start("serialized-interrupt");
    await startupInspectionEntered;
    const cleanup = controller.interruptCleanup();
    let cleanupSettled = false;
    void cleanup.finally(() => {
      cleanupSettled = true;
    });

    await Promise.resolve();
    expect(cleanupSettled).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();

    releaseFirstInspection();
    const contextPath = await startup;
    await cleanup;

    expect(operations).toEqual(["docker", "docker"]);
    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(readTrustedLifecycleContext(contextPath, root, { allowRetired: true }).status).toBe("retired");
    expect(executeCommand.mock.calls).toHaveLength(2);
  });
});
