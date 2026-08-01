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

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `tracker_scan_jobs`. The connection persists for the lifetime of the
 * process (standard for BullMQ producers) so the repeatable registration does
 * not open a fresh Redis connection each call. The singleton is keyed by
 * `redisUrl`; passing a different URL re-creates the queue (mainly for
 * tests).
 */
function getTrackerScanQueue(redisUrl: string, queueName: string): Queue {
  if (trackerScanQueue && trackerScanQueueRedisUrl === redisUrl) {
    return trackerScanQueue;
  }
  if (trackerScanQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void trackerScanQueue.close().catch(() => undefined);
  }
  trackerScanQueue = new Queue(queueName, { connection: { url: redisUrl } });
  trackerScanQueueRedisUrl = redisUrl;
  return trackerScanQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeTrackerScanSubmissionQueue(): Promise<void> {
  if (trackerScanQueue) {
    await trackerScanQueue.close().catch(() => undefined);
    trackerScanQueue = null;
    trackerScanQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
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
