import console from "node:console";
import { Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { createDbClient } from "../db/client.js";
import { resolveSerpProvider } from "../utils/serp-provider.js";
import type { SerpProvider } from "../utils/serp-provider.js";
import { processTrackerScanBatch } from "../processors/tracker-scan.js";
import {
  TRACKER_SCAN_JOB_RECORD_QUEUE_NAME,
  TRACKER_SCAN_QUEUE_NAME,
} from "./tracker-scan-submission.js";

// Helper to parse redis url for bullmq (same shape as crew-report-worker.ts)
function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) {
    return { host: "127.0.0.1", port: 8637 };
  }

  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port, 10) || 8637,
    };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

export interface TrackerScanWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `TRACKER_SCAN_QUEUE_NAME` env → the default
   * `"tracker_scan_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. The batch is sequential, default 1.
   */
  concurrency?: number;
  /**
   * Injected SERP provider override (tests pass a mock). When absent the
   * worker resolves the provider from `SEARXNG_BASE_URL` (live SearXNG) or
   * falls back to the deterministic mock (Sprint 0 default).
   */
  provider?: SerpProvider;
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
      // The repeatable batch job carries no per-target data; a fresh
      // job_records row is created on every fire for operator auditability.
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

  // Close db client when worker closes to avoid hanging connection.
  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
