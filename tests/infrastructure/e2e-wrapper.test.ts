import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  buildWorkerSpawnSpec,
  buildWorkerTerminationSpec,
  runE2E,
  stopWorker,
  waitForWorkerReady,
} from "../../scripts/run-test-e2e-wrapper.js";

function fakeWorker() {
  const worker = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: PassThrough;
    stderr: PassThrough;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
  };
  worker.pid = 9999;
  worker.stdout = new PassThrough();
  worker.stderr = new PassThrough();
  worker.exitCode = null;
  worker.signalCode = null;
  worker.kill = vi.fn(() => {
    worker.exitCode = 0;
    process.nextTick(() => worker.emit("close", 0, null));
    return true;
  });
  return worker;
}

function logger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    write: vi.fn(),
  };
}

function wrapperOptions(overrides: Record<string, unknown> = {}) {
  const worker = fakeWorker();
  const calls: string[] = [];
  const contextPath = "C:\\temporary\\e2e-context.json";
  const options = {
    logger: logger(),
    startInfrastructure: vi.fn(() => ({ status: 0, stdout: `${contextPath}\n`, stderr: "" })),
    contextExists: vi.fn(() => true),
    readContext: vi.fn(() => ({
      context: {
        databaseName: "test_db",
        hostPorts: { redis: 8637 },
        projectId: "test-project",
        queuePrefix: "test-project:queue",
      },
    })),
    provisionDatabase: vi.fn(async () => undefined),
    spawnWorker: vi.fn(() => worker),
    waitForWorkerReady: vi.fn(async () => undefined),
    observeWorker: vi.fn(() => ({ getFailure: () => null, dispose: vi.fn() })),
    stopWorker: vi.fn(async () => calls.push("stop-worker")),
    runPlaywright: vi.fn(async () => calls.push("playwright")),
    teardownLifecycle: vi.fn(async () => calls.push("teardown")),
    env: { TEST_WRAPPER: "true" },
    calls,
    worker,
    contextPath,
    ...overrides,
  };
  return options;
}

describe("E2E wrapper lifecycle", () => {
  it("fails before Playwright when the worker exits before readiness", async () => {
    const options = wrapperOptions({
      waitForWorkerReady: vi.fn(async () => {
        throw Object.assign(new Error("worker exited before readiness"), { status: 17 });
      }),
    });

    const result = await runE2E(options);

    expect(result.exitCode).toBe(17);
    expect(options.runPlaywright).not.toHaveBeenCalled();
    expect(options.stopWorker).toHaveBeenCalledBefore(options.teardownLifecycle);
    expect(options.teardownLifecycle).toHaveBeenCalledWith(options.contextPath);
  });

  it("preserves the Playwright exit status and still tears down", async () => {
    const options = wrapperOptions({
      runPlaywright: vi.fn(async () => {
        throw Object.assign(new Error("playwright failed"), { status: 7 });
      }),
    });

    const result = await runE2E(options);

    expect(result.exitCode).toBe(7);
    expect(options.stopWorker).toHaveBeenCalledBefore(options.teardownLifecycle);
    expect(options.teardownLifecycle).toHaveBeenCalledTimes(1);
  });

  it("fails when teardown fails after successful Playwright tests", async () => {
    const options = wrapperOptions({
      teardownLifecycle: vi.fn(async () => {
        throw Object.assign(new Error("teardown failed"), { status: 9 });
      }),
    });

    const result = await runE2E(options);

    expect(result.exitCode).toBe(9);
    expect(result.teardownError).toBeInstanceOf(Error);
    expect(options.runPlaywright).toHaveBeenCalledTimes(1);
  });

  it("reports startup_failed worker output", async () => {
    const worker = fakeWorker();
    const ready = waitForWorkerReady(worker, { timeoutMs: 100, forwardOutput: false });
    worker.stdout.write('{"status":"startup_failed"}\n');

    await expect(ready).rejects.toMatchObject({ code: "WORKER_STARTUP_FAILED" });
  });

  it("rejects when the worker closes before readiness", async () => {
    const worker = fakeWorker();
    const ready = waitForWorkerReady(worker, { timeoutMs: 100, forwardOutput: false });
    worker.emit("close", 23, null);

    await expect(ready).rejects.toMatchObject({ code: "WORKER_CLOSED" });
  });

  it("waits for worker close during shutdown", async () => {
    const worker = fakeWorker();
    const stopping = stopWorker(worker, { timeoutMs: 100, platform: "linux" });

    expect(worker.kill).toHaveBeenCalledTimes(1);
    await expect(stopping).resolves.toBeUndefined();
  });

  it("uses process tree termination command when pid is present on Windows", async () => {
    const worker = fakeWorker();
    worker.pid = 9812;
    const killWorkerTree = vi.fn(() => {
      worker.exitCode = 0;
      process.nextTick(() => worker.emit("close", 0, null));
      return { status: 0 };
    });

    const stopping = stopWorker(worker, { timeoutMs: 100, platform: "win32", killWorkerTree });
    expect(killWorkerTree).toHaveBeenCalledWith({
      command: "taskkill",
      args: ["/PID", "9812", "/T", "/F"],
    });
    await expect(stopping).resolves.toBeUndefined();
  });

  it("builds a shell-free Windows worker command", () => {
    expect(buildWorkerSpawnSpec("win32", "C:\\Windows\\System32\\cmd.exe")).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "corepack pnpm --filter @seovista/worker dev"],
      shell: false,
    });
    expect(buildWorkerSpawnSpec("linux", "cmd.exe")).toEqual({
      command: "corepack",
      args: ["pnpm", "--filter", "@seovista/worker", "dev"],
      shell: false,
    });
  });

  it("builds a Windows process-tree termination command", () => {
    expect(buildWorkerTerminationSpec("win32", 4312)).toEqual({
      command: "taskkill",
      args: ["/PID", "4312", "/T", "/F"],
    });
    expect(buildWorkerTerminationSpec("linux", 4312)).toBeNull();
  });
});
