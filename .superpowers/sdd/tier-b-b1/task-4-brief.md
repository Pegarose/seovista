## Task 4: Tracker Scan Queue + Worker + Scheduler

**Files:**
- Create: `apps/worker/src/queue/tracker-scan-submission.ts`
- Create: `apps/worker/src/queue/tracker-scan-worker.ts`
- Modify: `apps/worker/src/worker.ts` (add import + start + close)
- Test: `apps/worker/src/__tests__/tracker-scan-submission.test.ts`

**Interfaces:**
- Consumes: `processTrackerScanBatch` from `../processors/tracker-scan.js`, `resolveSerpProvider` from `../utils/serp-provider.js`, BullMQ `Queue` + `Worker`
- Produces:
  - `TRACKER_SCAN_QUEUE_NAME` (string, default `"tracker_scan_jobs"`)
  - `TRACKER_SCAN_JOB_NAME` (string, default `"tracker_scan_batch"`)
  - `TRACKER_SCAN_JOB_RECORD_QUEUE_NAME` (string, `"tracker_scan"`)
  - `registerTrackerScanRepeatable(redisUrl: string): Promise<void>` — registers the daily repeatable job
  - `startTrackerScanWorker(options?: TrackerScanWorkerOptions): Worker` — starts the BullMQ worker
  - `closeTrackerScanSubmissionQueue(): Promise<void>`
  - `__resetTrackerScanSubmissionQueueForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/tracker-scan-submission.test.ts`:

```typescript
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
  TRACKER_SCAN_QUEUE_NAME,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-submission.test.ts`
Expected: FAIL — `Cannot find module '../queue/tracker-scan-submission.js'`

- [ ] **Step 3: Implement the submission module**

Create `apps/worker/src/queue/tracker-scan-submission.ts`:

```typescript
import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";

/**
 * Tracker scan submission — registers the daily repeatable batch job that
 * scans all active keyword targets via SearXNG and records rank observations.
 *
 * Unlike the one-off job chains (geo/schema/keyword-rank/crew-report), there
 * is no user-triggered "submit" call. The repeatable job is registered once
 * at worker startup via `registerTrackerScanRepeatable` and fires
 * automatically on the cron schedule.
 */

export const TRACKER_SCAN_QUEUE_NAME = "tracker_scan_jobs";
export const TRACKER_SCAN_JOB_NAME = "tracker_scan_batch";
export const TRACKER_SCAN_JOB_RECORD_QUEUE_NAME = "tracker_scan";

const TRACKER_SCAN_QUEUE_NAME_ENV = "TRACKER_SCAN_QUEUE_NAME";
const TRACKER_SCAN_CRON_ENV = "TRACKER_SCAN_CRON";
const DEFAULT_CRON = "0 3 * * *";

let trackerScanQueue: Queue | null = null;
let trackerScanQueueRedisUrl: string | null = null;

function getTrackerScanQueue(redisUrl: string, queueName: string): Queue {
  if (trackerScanQueue && trackerScanQueueRedisUrl === redisUrl) {
    return trackerScanQueue;
  }
  if (trackerScanQueue) {
    void trackerScanQueue.close().catch(() => undefined);
  }
  trackerScanQueue = new Queue(queueName, { connection: { url: redisUrl } });
  trackerScanQueueRedisUrl = redisUrl;
  return trackerScanQueue;
}

export async function closeTrackerScanSubmissionQueue(): Promise<void> {
  if (trackerScanQueue) {
    await trackerScanQueue.close().catch(() => undefined);
    trackerScanQueue = null;
    trackerScanQueueRedisUrl = null;
  }
}

export function __resetTrackerScanSubmissionQueueForTests(): void {
  trackerScanQueue = null;
  trackerScanQueueRedisUrl = null;
}

function resolveQueueName(): string {
  return process.env[TRACKER_SCAN_QUEUE_NAME_ENV] ?? TRACKER_SCAN_QUEUE_NAME;
}

function resolveCronPattern(): string {
  return process.env[TRACKER_SCAN_CRON_ENV] ?? DEFAULT_CRON;
}

/**
 * Registers the daily repeatable batch job. BullMQ deduplicates repeatable
 * jobs by their repeat key (job name + pattern), so calling this multiple
 * times with the same pattern is safe — it will not create duplicate
 * schedules.
 */
export async function registerTrackerScanRepeatable(redisUrl: string): Promise<void> {
  const queue = getTrackerScanQueue(redisUrl, resolveQueueName());
  const pattern = resolveCronPattern();

  await queue.add(
    TRACKER_SCAN_JOB_NAME,
    {},
    { repeat: { pattern } },
  );

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-scan-submission",
      event: "repeatable_registered",
      cron: pattern,
      timestamp: new Date().toISOString(),
    }),
  );
}
```

- [ ] **Step 4: Implement the worker**

Create `apps/worker/src/queue/tracker-scan-worker.ts`:

```typescript
import console from "node:console";
import { Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { createDbClient } from "../db/client.js";
import { resolveSerpProvider } from "../utils/serp-provider.js";
import { processTrackerScanBatch } from "../processors/tracker-scan.js";
import {
  TRACKER_SCAN_JOB_NAME,
  TRACKER_SCAN_JOB_RECORD_QUEUE_NAME,
  TRACKER_SCAN_QUEUE_NAME,
} from "./tracker-scan-submission.js";

function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) return { host: "127.0.0.1", port: 8637 };
  try {
    const url = new URL(redisUrl);
    return { host: url.hostname || "127.0.0.1", port: parseInt(url.port, 10) || 8637 };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

export interface TrackerScanWorkerOptions {
  /** Override the BullMQ queue name (tests use unique names). */
  queueName?: string;
  /** Override concurrency (batch is sequential, default 1). */
  concurrency?: number;
  /** Injected SERP provider override (tests pass a mock). */
  provider?: import("../utils/serp-provider.js").SerpProvider;
}

export function startTrackerScanWorker(options?: TrackerScanWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start tracker scan worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.TRACKER_SCAN_QUEUE_NAME ?? TRACKER_SCAN_QUEUE_NAME,
    async (_job: Job) => {
      // Create a job_records row for operator auditability.
      const jobId = randomUUID();
      const jobIdentity = randomUUID();
      const correlationId = randomUUID();

      await db.query(
        `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
         VALUES ($1, $2, $3, $4, 'batch', 'running')`,
        [jobId, jobIdentity, TRACKER_SCAN_JOB_RECORD_QUEUE_NAME, correlationId],
      );

      try {
        const provider = options?.provider ?? resolveSerpProvider();
        const delayMs = Number(process.env.TRACKER_SCAN_DELAY_MS) || 2000;

        const result = await processTrackerScanBatch({ db, provider, delayMs });

        // Store the batch summary in job_results for auditability.
        await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'tracker-scan:result', $3)`,
          [correlationId, jobIdentity, JSON.stringify({ kind: "tracker-scan", ...result })],
        );

        await db.query(
          `UPDATE job_records SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId],
        );
      } catch (error) {
        await db.query(
          `UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`,
          [jobId],
        );
        throw error;
      }
    },
    { connection, autorun: true, concurrency: options?.concurrency ?? 1 },
  );

  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-submission.test.ts`
Expected: PASS — all 2 tests pass.

- [ ] **Step 6: Wire into worker.ts**

In `apps/worker/src/worker.ts`, add the import after the crew report worker import (line 11):

```typescript
import { startTrackerScanWorker } from "./queue/tracker-scan-worker.js";
import { registerTrackerScanRepeatable, closeTrackerScanSubmissionQueue } from "./queue/tracker-scan-submission.js";
```

Add to the `RunningWorker` interface (after `crewReportWorker: Worker;`):

```typescript
  trackerScanWorker: Worker;
```

Add after the crew report worker start (after line 78, `const crewReportWorker = startCrewReportWorker();`):

```typescript
  const trackerScanWorker = startTrackerScanWorker();
  // Register the daily repeatable batch job. Safe to call on every startup —
  // BullMQ deduplicates repeatable jobs by their repeat key.
  await registerTrackerScanRepeatable(workerEnv.REDIS_URL);
```

Add to the `running` assignment:

```typescript
  running = { db, queue, worker, geoWorker, schemaWorker, aiCrawlerWorker, keywordRankWorker, crewReportWorker, trackerScanWorker };
```

Add to the shutdown sequence (before `await current.queue.close();`):

```typescript
  await current.trackerScanWorker.close(false);
  await closeTrackerScanSubmissionQueue();
```

- [ ] **Step 7: Run the full worker test suite to check for regressions**

Run: `pnpm --filter @seovista/worker exec vitest run`
Expected: All tests pass (including the 2 new tracker-scan-submission tests). Known acceptable failure: geo-worker 429 (environmental).

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/queue/tracker-scan-submission.ts apps/worker/src/queue/tracker-scan-worker.ts apps/worker/src/worker.ts apps/worker/src/__tests__/tracker-scan-submission.test.ts
git commit -m "feat(worker): tracker scan queue + daily repeatable batch job + worker.ts wiring

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---


