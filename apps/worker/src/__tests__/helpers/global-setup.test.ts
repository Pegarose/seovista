import { describe, expect, it, vi } from "vitest";
import { createWorkerGlobalSetup } from "./global-setup.js";
import type { ParentStack } from "./test-env.js";

const ownedStack: ParentStack = {
  contextPath: "C:/owned/generated-context.json",
  context: {
    runId: "worker-owned",
    projectId: "worker-owned",
    composeProject: "worker-owned",
    databaseName: "worker_owned",
    redisNamespace: "worker-owned:",
    redisDatabase: 0,
    queuePrefix: "worker-owned:queue:",
    correlationIdPrefix: "worker-owned-correlation-",
    hostPorts: { postgres: 55432, redis: 56379 },
    createdAt: "2026-07-15T00:00:00.000Z",
    cleanupAuthority: "context:worker-owned",
    evidenceDirectory: "C:/repo/.lifecycle-evidence/worker-owned",
    ownershipToken: "a".repeat(64),
  },
  ownsStack: true,
};

describe("worker Vitest global setup", () => {
  it("provides one exact context to all workers and tears down only the stack it created", async () => {
    const provide = vi.fn();
    const stop = vi.fn();
    const setup = createWorkerGlobalSetup({
      resolveParent: vi.fn().mockResolvedValue(ownedStack),
      stopParent: stop,
    });

    const teardown = await setup({ provide } as never);

    expect(provide).toHaveBeenCalledWith("seovistaLifecycleContextPath", ownedStack.contextPath);
    await teardown();
    expect(stop).toHaveBeenCalledWith(ownedStack);
  });

  it("does not teardown a context supplied by a parent", async () => {
    const supplied = { ...ownedStack, ownsStack: false };
    const stop = vi.fn();
    const setup = createWorkerGlobalSetup({
      resolveParent: vi.fn().mockResolvedValue(supplied),
      stopParent: stop,
    });

    const teardown = await setup({ provide: vi.fn() } as never);
    await teardown();

    expect(stop).not.toHaveBeenCalled();
  });

  it("rejects global teardown when owned infrastructure cleanup fails", async () => {
    const cleanupFailure = new Error("owned teardown inspection failed");
    const setup = createWorkerGlobalSetup({
      resolveParent: vi.fn().mockResolvedValue(ownedStack),
      stopParent: vi.fn(() => {
        throw cleanupFailure;
      }),
    });

    const teardown = await setup({ provide: vi.fn() } as never);

    await expect(teardown()).rejects.toBe(cleanupFailure);
  });
});
