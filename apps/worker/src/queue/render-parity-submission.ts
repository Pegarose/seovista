import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";

/**
 * Render parity diff submission orchestration.
 *
 * Mirrors the AI crawler / schema truth chains — no lead capture, no
 * single-flight dedupe; a submission is exactly:
 *
 *   1. Insert one `job_records` row with queue_name `render_parity_audit`
 *      and status `'queued'`.
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, url }`; the worker
 *      fetches the page twice through the SSRF-hardened fetcher (browser UA
 *      + crawler UA), runs {@link processRenderParityPayload}, and persists
 *      the result into `job_results` with `result_type = 'render-parity:result'`.
 */

/** BullMQ queue name the production render parity worker consumes. */
export const RENDER_PARITY_QUEUE_NAME = "render_parity_audit_jobs";

/** BullMQ job name for render parity diff extraction. */
export const RENDER_PARITY_JOB_NAME = "render_parity_audit";

/**
 * Value persisted in `job_records.queue_name` for render parity audits.
 * Result pages filter `job_records` on this value so a foreign job-id cannot
 * be used to leak another audit's payload.
 */
export const RENDER_PARITY_JOB_RECORD_QUEUE_NAME = "render_parity_audit";

/**
 * Queue name override env shared with the worker. Both sides resolve the
 * queue the same way — worker: `options.queueName` → this env → the
 * default; submission: this env → the same default.
 */
const RENDER_PARITY_QUEUE_NAME_ENV = "RENDER_PARITY_QUEUE_NAME";

let renderParityQueue: Queue | null = null;
let renderParityQueueRedisUrl: string | null = null;

function getRenderParityQueue(redisUrl: string, queueName: string): Queue {
  if (renderParityQueue && renderParityQueueRedisUrl === redisUrl) {
    return renderParityQueue;
  }
  if (renderParityQueue) {
    void renderParityQueue.close().catch(() => undefined);
  }
  renderParityQueue = new Queue(queueName, { connection: { url: redisUrl } });
  renderParityQueueRedisUrl = redisUrl;
  return renderParityQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeRenderParitySubmissionQueue(): Promise<void> {
  if (renderParityQueue) {
    await renderParityQueue.close().catch(() => undefined);
    renderParityQueue = null;
    renderParityQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetRenderParitySubmissionQueueForTests(): void {
  renderParityQueue = null;
  renderParityQueueRedisUrl = null;
}

export interface SubmitRenderParityInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Canonical audit target URL. */
  url: string;
}

export interface SubmitRenderParityResult {
  /** The job_records id the caller should redirect to / poll. */
  jobId: string;
}

export async function submitRenderParityCheck(
  input: SubmitRenderParityInput,
): Promise<SubmitRenderParityResult> {
  const { db, redisUrl, url } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')`,
    [jobId, jobIdentity, RENDER_PARITY_JOB_RECORD_QUEUE_NAME, correlationId, url],
  );

  const queue = getRenderParityQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(RENDER_PARITY_JOB_NAME, { jobId, url }, { jobId });
  } catch (enqueueError) {
    // Orphaned-row compensation: the job_records INSERT has already
    // committed; delete it before rethrowing so a failed enqueue does not
    // leave a permanently 'queued' row no worker will consume.
    try {
      await db.query(`DELETE FROM job_records WHERE id = $1`, [jobId]);
    } catch (compensationError) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "render-parity-submission",
          event: "orphan_compensation_failed",
          jobId,
          error:
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError),
          timestamp: new Date().toISOString(),
        }),
      );
    }
    throw enqueueError;
  }

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "render-parity-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[RENDER_PARITY_QUEUE_NAME_ENV] ?? RENDER_PARITY_QUEUE_NAME;
}
