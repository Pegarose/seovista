import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const bullmqState = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add(...args: unknown[]) {
      return bullmqState.add(...args);
    }
    async close(): Promise<void> {}
  },
  Worker: class {
    constructor() {}
    on() { return this; }
    async close(): Promise<void> {}
  },
}));

import {
  registerTrackerScanRepeatable,
  __resetTrackerScanSubmissionQueueForTests,
  TRACKER_SCAN_JOB_NAME,
} from "../queue/tracker-scan-submission.js";

const REDIS_URL = "redis://127.0.0.1:8637";

describe("tracker-scan-submission", () => {
  beforeEach(() => {
    bullmqState.add.mockReset();
    __resetTrackerScanSubmissionQueueForTests();
  });

  afterEach(() => {
    __resetTrackerScanSubmissionQueueForTests();
  });

  it("registerTrackerScanRepeatable adds a repeatable job with the cron pattern", async () => {
    bullmqState.add.mockResolvedValue({ id: "repeatable-1" });
    await registerTrackerScanRepeatable(REDIS_URL);

    expect(bullmqState.add).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = bullmqState.add.mock.calls[0]!;
    expect(jobName).toBe(TRACKER_SCAN_JOB_NAME);
    expect(data).toEqual({});
    expect(opts).toHaveProperty("repeat");
    expect((opts as { repeat: { pattern: string } }).repeat.pattern).toBe("0 3 * * *");
  });

  it("uses the TRACKER_SCAN_CRON env when set", async () => {
    bullmqState.add.mockResolvedValue({ id: "repeatable-2" });
    process.env.TRACKER_SCAN_CRON = "0 5 * * *";
    try {
      await registerTrackerScanRepeatable(REDIS_URL);
      const opts = bullmqState.add.mock.calls[0]![2] as { repeat: { pattern: string } };
      expect(opts.repeat.pattern).toBe("0 5 * * *");
    } finally {
      delete process.env.TRACKER_SCAN_CRON;
    }
  });
});
