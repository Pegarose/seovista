## Commits
98ccd84 feat(worker): tracker scan queue + daily repeatable batch job + worker.ts wiring

## Stat
 .../src/__tests__/tracker-scan-submission.test.ts  |  66 +++++++++++++
 apps/worker/src/queue/tracker-scan-submission.ts   |  97 ++++++++++++++++++
 apps/worker/src/queue/tracker-scan-worker.ts       | 110 +++++++++++++++++++++
 apps/worker/src/worker.ts                          |  16 ++-
 4 files changed, 288 insertions(+), 1 deletion(-)

## Full Diff
diff --git a/apps/worker/src/__tests__/tracker-scan-submission.test.ts b/apps/worker/src/__tests__/tracker-scan-submission.test.ts
new file mode 100644
index 0000000..e620176
--- /dev/null
+++ b/apps/worker/src/__tests__/tracker-scan-submission.test.ts
@@ -0,0 +1,66 @@
+import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
+
+const bullmqState = vi.hoisted(() => ({
+  add: vi.fn(),
+}));
+
+vi.mock("bullmq", () => ({
+  Queue: class {
+    name: string;
+    constructor(name: string) {
+      this.name = name;
+    }
+    add(...args: unknown[]) {
+      return bullmqState.add(...args);
+    }
+    async close(): Promise<void> {}
+  },
+  Worker: class {
+    constructor() {}
+    on() { return this; }
+    async close(): Promise<void> {}
+  },
+}));
+
+import {
+  registerTrackerScanRepeatable,
+  __resetTrackerScanSubmissionQueueForTests,
+  TRACKER_SCAN_JOB_NAME,
+} from "../queue/tracker-scan-submission.js";
+
+const REDIS_URL = "redis://127.0.0.1:8637";
+
+describe("tracker-scan-submission", () => {
+  beforeEach(() => {
+    bullmqState.add.mockReset();
+    __resetTrackerScanSubmissionQueueForTests();
+  });
+
+  afterEach(() => {
+    __resetTrackerScanSubmissionQueueForTests();
+  });
+
+  it("registerTrackerScanRepeatable adds a repeatable job with the cron pattern", async () => {
+    bullmqState.add.mockResolvedValue({ id: "repeatable-1" });
+    await registerTrackerScanRepeatable(REDIS_URL);
+
+    expect(bullmqState.add).toHaveBeenCalledTimes(1);
+    const [jobName, data, opts] = bullmqState.add.mock.calls[0]!;
+    expect(jobName).toBe(TRACKER_SCAN_JOB_NAME);
+    expect(data).toEqual({});
+    expect(opts).toHaveProperty("repeat");
+    expect((opts as { repeat: { pattern: string } }).repeat.pattern).toBe("0 3 * * *");
+  });
+
+  it("uses the TRACKER_SCAN_CRON env when set", async () => {
+    bullmqState.add.mockResolvedValue({ id: "repeatable-2" });
+    process.env.TRACKER_SCAN_CRON = "0 5 * * *";
+    try {
+      await registerTrackerScanRepeatable(REDIS_URL);
+      const opts = bullmqState.add.mock.calls[0]![2] as { repeat: { pattern: string } };
+      expect(opts.repeat.pattern).toBe("0 5 * * *");
+    } finally {
+      delete process.env.TRACKER_SCAN_CRON;
+    }
+  });
+});
diff --git a/apps/worker/src/queue/tracker-scan-submission.ts b/apps/worker/src/queue/tracker-scan-submission.ts
new file mode 100644
index 0000000..e7890e2
--- /dev/null
+++ b/apps/worker/src/queue/tracker-scan-submission.ts
@@ -0,0 +1,97 @@
+import console from "node:console";
+import { Queue } from "bullmq";
+
+/**
+ * Tracker scan submission — registers the daily repeatable batch job that
+ * scans all active keyword targets via SearXNG and records rank observations.
+ *
+ * Unlike the one-off job chains (geo/schema/keyword-rank/crew-report), there
+ * is no user-triggered "submit" call. The repeatable job is registered once
+ * at worker startup via `registerTrackerScanRepeatable` and fires
+ * automatically on the cron schedule.
+ */
+
+export const TRACKER_SCAN_QUEUE_NAME = "tracker_scan_jobs";
+export const TRACKER_SCAN_JOB_NAME = "tracker_scan_batch";
+export const TRACKER_SCAN_JOB_RECORD_QUEUE_NAME = "tracker_scan";
+
+const TRACKER_SCAN_QUEUE_NAME_ENV = "TRACKER_SCAN_QUEUE_NAME";
+const TRACKER_SCAN_CRON_ENV = "TRACKER_SCAN_CRON";
+const DEFAULT_CRON = "0 3 * * *";
+
+let trackerScanQueue: Queue | null = null;
+let trackerScanQueueRedisUrl: string | null = null;
+
+/**
+ * Lazily creates and caches a singleton BullMQ Queue producer for
+ * `tracker_scan_jobs`. The connection persists for the lifetime of the
+ * process (standard for BullMQ producers) so the repeatable registration does
+ * not open a fresh Redis connection each call. The singleton is keyed by
+ * `redisUrl`; passing a different URL re-creates the queue (mainly for
+ * tests).
+ */
+function getTrackerScanQueue(redisUrl: string, queueName: string): Queue {
+  if (trackerScanQueue && trackerScanQueueRedisUrl === redisUrl) {
+    return trackerScanQueue;
+  }
+  if (trackerScanQueue) {
+    // URL changed (test scenario) — close the previous producer first.
+    void trackerScanQueue.close().catch(() => undefined);
+  }
+  trackerScanQueue = new Queue(queueName, { connection: { url: redisUrl } });
+  trackerScanQueueRedisUrl = redisUrl;
+  return trackerScanQueue;
+}
+
+/**
+ * Closes the cached BullMQ Queue producer. Intended for tests and worker
+ * shutdown; production callers leave it open for the process lifetime.
+ */
+export async function closeTrackerScanSubmissionQueue(): Promise<void> {
+  if (trackerScanQueue) {
+    await trackerScanQueue.close().catch(() => undefined);
+    trackerScanQueue = null;
+    trackerScanQueueRedisUrl = null;
+  }
+}
+
+/** Resets the singleton state. Intended for unit tests. */
+export function __resetTrackerScanSubmissionQueueForTests(): void {
+  trackerScanQueue = null;
+  trackerScanQueueRedisUrl = null;
+}
+
+function resolveQueueName(): string {
+  return process.env[TRACKER_SCAN_QUEUE_NAME_ENV] ?? TRACKER_SCAN_QUEUE_NAME;
+}
+
+function resolveCronPattern(): string {
+  return process.env[TRACKER_SCAN_CRON_ENV] ?? DEFAULT_CRON;
+}
+
+/**
+ * Registers the daily repeatable batch job. BullMQ deduplicates repeatable
+ * jobs by their repeat key (job name + pattern), so calling this multiple
+ * times with the same pattern is safe — it will not create duplicate
+ * schedules.
+ */
+export async function registerTrackerScanRepeatable(redisUrl: string): Promise<void> {
+  const queue = getTrackerScanQueue(redisUrl, resolveQueueName());
+  const pattern = resolveCronPattern();
+
+  await queue.add(
+    TRACKER_SCAN_JOB_NAME,
+    {},
+    { repeat: { pattern } },
+  );
+
+  console.log(
+    JSON.stringify({
+      name: "@seovista/worker",
+      layer: "tracker-scan-submission",
+      event: "repeatable_registered",
+      cron: pattern,
+      timestamp: new Date().toISOString(),
+    }),
+  );
+}
diff --git a/apps/worker/src/queue/tracker-scan-worker.ts b/apps/worker/src/queue/tracker-scan-worker.ts
new file mode 100644
index 0000000..a8f871b
--- /dev/null
+++ b/apps/worker/src/queue/tracker-scan-worker.ts
@@ -0,0 +1,110 @@
+import console from "node:console";
+import { Worker, type Job } from "bullmq";
+import { randomUUID } from "node:crypto";
+import { createDbClient } from "../db/client.js";
+import { resolveSerpProvider } from "../utils/serp-provider.js";
+import type { SerpProvider } from "../utils/serp-provider.js";
+import { processTrackerScanBatch } from "../processors/tracker-scan.js";
+import {
+  TRACKER_SCAN_JOB_RECORD_QUEUE_NAME,
+  TRACKER_SCAN_QUEUE_NAME,
+} from "./tracker-scan-submission.js";
+
+// Helper to parse redis url for bullmq (same shape as crew-report-worker.ts)
+function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
+  if (!redisUrl) {
+    return { host: "127.0.0.1", port: 8637 };
+  }
+
+  try {
+    const url = new URL(redisUrl);
+    return {
+      host: url.hostname || "127.0.0.1",
+      port: parseInt(url.port, 10) || 8637,
+    };
+  } catch {
+    return { host: "127.0.0.1", port: 8637 };
+  }
+}
+
+export interface TrackerScanWorkerOptions {
+  /**
+   * Override the BullMQ queue name. Resolution order:
+   * `options.queueName` → `TRACKER_SCAN_QUEUE_NAME` env → the default
+   * `"tracker_scan_jobs"` — the same env the submission side reads, so
+   * setting it on both sides keeps producer and consumer on the same queue.
+   * Tests pass a unique name so parallel workers / orphaned processes
+   * listening on the default queue cannot steal their jobs.
+   */
+  queueName?: string;
+  /**
+   * Override BullMQ concurrency limit. The batch is sequential, default 1.
+   */
+  concurrency?: number;
+  /**
+   * Injected SERP provider override (tests pass a mock). When absent the
+   * worker resolves the provider from `SEARXNG_BASE_URL` (live SearXNG) or
+   * falls back to the deterministic mock (Sprint 0 default).
+   */
+  provider?: SerpProvider;
+}
+
+export function startTrackerScanWorker(options?: TrackerScanWorkerOptions) {
+  const connection = parseRedisUrl(process.env.REDIS_URL);
+
+  if (!process.env.DATABASE_URL) {
+    throw new Error("DATABASE_URL is required to start tracker scan worker");
+  }
+
+  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
+
+  const worker = new Worker(
+    options?.queueName ?? process.env.TRACKER_SCAN_QUEUE_NAME ?? TRACKER_SCAN_QUEUE_NAME,
+    async (_job: Job) => {
+      // The repeatable batch job carries no per-target data; a fresh
+      // job_records row is created on every fire for operator auditability.
+      const jobId = randomUUID();
+      const jobIdentity = randomUUID();
+      const correlationId = randomUUID();
+
+      await db.query(
+        `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
+         VALUES ($1, $2, $3, $4, 'batch', 'running')`,
+        [jobId, jobIdentity, TRACKER_SCAN_JOB_RECORD_QUEUE_NAME, correlationId],
+      );
+
+      try {
+        const provider = options?.provider ?? resolveSerpProvider();
+        const delayMs = Number(process.env.TRACKER_SCAN_DELAY_MS) || 2000;
+
+        const result = await processTrackerScanBatch({ db, provider, delayMs });
+
+        // Store the batch summary in job_results for auditability.
+        await db.query(
+          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
+           VALUES ($1, $2, 'tracker-scan:result', $3)`,
+          [correlationId, jobIdentity, JSON.stringify({ kind: "tracker-scan", ...result })],
+        );
+
+        await db.query(
+          `UPDATE job_records SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`,
+          [jobId],
+        );
+      } catch (error) {
+        await db.query(
+          `UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`,
+          [jobId],
+        );
+        throw error;
+      }
+    },
+    { connection, autorun: true, concurrency: options?.concurrency ?? 1 },
+  );
+
+  // Close db client when worker closes to avoid hanging connection.
+  worker.on("closed", () => {
+    db.close().catch(console.error);
+  });
+
+  return worker;
+}
diff --git a/apps/worker/src/worker.ts b/apps/worker/src/worker.ts
index 24444e6..3ccf99b 100644
--- a/apps/worker/src/worker.ts
+++ b/apps/worker/src/worker.ts
@@ -2,37 +2,43 @@ import { env, exit, stdin, argv } from "node:process";
 import { resolve } from "node:path";
 import { fileURLToPath } from "node:url";
 import console from "node:console";
 import { createDbClient, type DbClient } from "./db/client.js";
 import { createPingQueue, createPingWorker } from "./queue/ping.js";
 import { startGeoWorker } from "./queue/geo-worker.js";
 import { startSchemaWorker } from "./queue/schema-worker.js";
 import { startAiCrawlerWorker } from "./queue/ai-crawler-worker.js";
 import { startKeywordRankWorker } from "./queue/keyword-rank-worker.js";
 import { startCrewReportWorker } from "./queue/crew-report-worker.js";
+import { startTrackerScanWorker } from "./queue/tracker-scan-worker.js";
+import {
+  registerTrackerScanRepeatable,
+  closeTrackerScanSubmissionQueue,
+} from "./queue/tracker-scan-submission.js";
 import { closeCacheRedis } from "./utils/render-cache.js";
 import { logDailyCreditBudgetOnBoot } from "./utils/credit-guard.js";
 import { getWorkerEnv, getProjectId } from "./env.js";
 import { checkWorkerHealth } from "./health.js";
 import type { Queue, Worker } from "bullmq";
 
 export const workerName = "@seovista/worker";
 
 interface RunningWorker {
   db: DbClient;
   queue: Queue;
   worker: Worker;
   geoWorker: Worker;
   schemaWorker: Worker;
   aiCrawlerWorker: Worker;
   keywordRankWorker: Worker;
   crewReportWorker: Worker;
+  trackerScanWorker: Worker;
 }
 
 let running: RunningWorker | null = null;
 let shutdownRequested = false;
 
 function isEntryModule(): boolean {
   const modulePath = fileURLToPath(import.meta.url);
   const entryPath = argv[1] ? resolve(argv[1]) : undefined;
   return entryPath ? modulePath === entryPath : false;
 }
@@ -69,22 +75,28 @@ async function run(): Promise<void> {
     db,
   };
 
   const queue = createPingQueue(queueOptions);
   const worker = createPingWorker(queueOptions);
   const geoWorker = startGeoWorker();
   const schemaWorker = startSchemaWorker();
   const aiCrawlerWorker = startAiCrawlerWorker();
   const keywordRankWorker = startKeywordRankWorker();
   const crewReportWorker = startCrewReportWorker();
+  const trackerScanWorker = startTrackerScanWorker();
+  // Register the daily repeatable batch job. Safe to call on every startup —
+  // BullMQ deduplicates repeatable jobs by their repeat key (job name +
+  // pattern), so re-registering with the same cron does not create duplicate
+  // schedules.
+  await registerTrackerScanRepeatable(workerEnv.REDIS_URL);
 
-  running = { db, queue, worker, geoWorker, schemaWorker, aiCrawlerWorker, keywordRankWorker, crewReportWorker };
+  running = { db, queue, worker, geoWorker, schemaWorker, aiCrawlerWorker, keywordRankWorker, crewReportWorker, trackerScanWorker };
 
   // Phase A — VAL-A-MIT-004: on boot, log the remaining daily Browseract
   // credit budget so operators can see the daily cap state at startup. Reads
   // `browseract:credits:consumed:{YYYY-MM-DD}` from Redis DB 1 and compares
   // against `BROWSERACT_DAILY_CREDIT_LIMIT` (default 4000). Degrades to a
   // full-budget line when Redis is unreachable.
   await logDailyCreditBudgetOnBoot();
 
   worker.on("completed", (job) => {
     console.log(
@@ -139,20 +151,22 @@ async function shutdown(signal: string): Promise<void> {
 
   const current = running;
   running = null;
 
   if (current) {
     // Drain or recover: stop accepting new jobs and wait for active jobs to finish.
     // The crew report worker closes first: its jobs depend on an external
     // polling loop and should stop picking up new work before the audit
     // chains that feed it drain.
     await current.crewReportWorker.close(false);
+    await current.trackerScanWorker.close(false);
+    await closeTrackerScanSubmissionQueue();
     await current.keywordRankWorker.close(false);
     await current.aiCrawlerWorker.close(false);
     await current.schemaWorker.close(false);
     await current.geoWorker.close(false);
     await current.worker.close(false);
     await current.queue.close();
     await current.db.close();
   }
 
   // Close the Phase A render-cache Redis client (DB 1), if one was opened.
