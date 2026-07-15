import { describe, expect, it, vi } from "vitest";

const bullmqState = vi.hoisted(() => ({ queueOptions: undefined as unknown, workerOptions: undefined as unknown }));

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string, options: unknown) {
      this.name = name;
      bullmqState.queueOptions = options;
    }
  },
  Worker: class {
    name: string;
    constructor(name: string, _processor: unknown, options: unknown) {
      this.name = name;
      bullmqState.workerOptions = options;
    }
  },
}));

import { createPingQueue, createPingQueueName, createPingWorker } from "../queue/ping.js";

const db = {} as never;

describe("BullMQ lifecycle prefixing", () => {
  it("keeps the queue name stable and applies the lifecycle prefix to Queue Redis keys", () => {
    const queue = createPingQueue({
      projectId: "worker-a",
      redisUrl: "redis://127.0.0.1:56379/0",
      queuePrefix: "seovista-run:queue:",
      db,
    });

    expect(queue.name).toBe(createPingQueueName("worker-a"));
    expect(bullmqState.queueOptions).toEqual(
      expect.objectContaining({ prefix: "seovista-run:queue:" }),
    );
  });

  it("applies the identical lifecycle prefix to Worker Redis keys", () => {
    const worker = createPingWorker({
      projectId: "worker-a",
      redisUrl: "redis://127.0.0.1:56379/0",
      queuePrefix: "seovista-run:queue:",
      db,
    });

    expect(worker.name).toBe(createPingQueueName("worker-a"));
    expect(bullmqState.workerOptions).toEqual(
      expect.objectContaining({ prefix: "seovista-run:queue:" }),
    );
  });
});
