import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";

/**
 * Schema truth check submission orchestration.
 *
 * Mirrors the AI crawler audit chain (`ai-crawler-submission.ts`): no lead
 * capture, no single-flight dedupe. Submission is exactly:
 *
 *   1. Insert one `job_records` row with the authoritative column set
 *      (`id`, `job_identity`, `queue_name`, `correlation_id`, `target`,
 *      `status = 'queued'`).
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, url }`; the worker
 *      (`schema-truth-worker.ts`) fetches the page through the SSRF-hardened
 *      fetcher, runs {@link processSchemaTruthPayload} and persists the
 *      result into `job_results` with `result_type = 'schema-truth:result'`.
 *
 * The `queue_name` column carries the service identifier `schema_truth_audit`,
 * which is what the result page filters on when resolving a `jobId`.
 */

/** BullMQ queue name the production schema truth worker consumes. */
export const SCHEMA_TRUTH_QUEUE_NAME = "schema_truth_audit_jobs";

/** BullMQ job name for schema truth extraction. */
export const SCHEMA_TRUTH_JOB_NAME = "schema_truth_audit";

/**
 * Value persisted in `job_records.queue_name` for schema truth audits. The
 * result page filters on this value so a foreign job-id cannot be forced to
 * leak another audit's payload.
 */
export const SCHEMA_TRUTH_JOB_RECORD_QUEUE_NAME = "schema_truth_audit";

/**
 * Queue name override env shared with the worker. Both sides resolve the
 * queue the same way — worker: `options.queueName` → this env → the default;
 * submission: this env → the same default.
 */
const SCHEMA_TRUTH_QUEUE_NAME_ENV = "SCHEMA_TRUTH_QUEUE_NAME";

let schemaTruthQueue: Queue | null = null;
let schemaTruthQueueRedisUrl: string | null = null;

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `schema_truth_audit_jobs`. The connection persists for the lifetime of
 * the process (standard for BullMQ producers); the singleton is keyed by
 * `redisUrl` so passing a different URL (mainly in tests) re-creates the
 * queue cleanly.
 */
function getSchemaTruthQueue(redisUrl: string, queueName: string): Queue {
  if (schemaTruthQueue && schemaTruthQueueRedisUrl === redisUrl) {
    return schemaTruthQueue;
  }
  if (schemaTruthQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void schemaTruthQueue.close().catch(() => undefined);
  }
  schemaTruthQueue = new Queue(queueName, { connection: { url: redisUrl } });
  schemaTruthQueueRedisUrl = redisUrl;
  return schemaTruthQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeSchemaTruthSubmissionQueue(): Promise<void> {
  if (schemaTruthQueue) {
    await schemaTruthQueue.close().catch(() => undefined);
    schemaTruthQueue = null;
    schemaTruthQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetSchemaTruthSubmissionQueueForTests(): void {
  schemaTruthQueue = null;
  schemaTruthQueueRedisUrl = null;
}

export interface SubmitSchemaTruthInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Canonical audit target URL. */
  url: string;
}

export interface SubmitSchemaTruthResult {
  /** The job_records id the caller should redirect to / poll. */
  jobId: string;
}

/**
 * Submits a schema truth check: inserts the `job_records` row and enqueues
 * the BullMQ job. See the module docstring for the full contract.
 */
export async function submitSchemaTruthCheck(
  input: SubmitSchemaTruthInput,
): Promise<SubmitSchemaTruthResult> {
  const { db, redisUrl, url } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')`,
    [jobId, jobIdentity, SCHEMA_TRUTH_JOB_RECORD_QUEUE_NAME, correlationId, url],
  );

  const queue = getSchemaTruthQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(
      SCHEMA_TRUTH_JOB_NAME,
      { jobId, url },
      { jobId },
    );
  } catch (enqueueError) {
    // Orphaned-row compensation: the job_records INSERT above has already
    // committed, so a failed enqueue would leave a permanent 'queued' row no
    // worker will ever consume. Delete the orphaned row before rethrowing so
    // the caller sees the original enqueue error and no stale record remains.
    try {
      await db.query(`DELETE FROM job_records WHERE id = $1`, [jobId]);
    } catch (compensationError) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "schema-truth-submission",
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
      layer: "schema-truth-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[SCHEMA_TRUTH_QUEUE_NAME_ENV] ?? SCHEMA_TRUTH_QUEUE_NAME;
}
