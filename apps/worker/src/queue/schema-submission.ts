import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";

/**
 * Schema audit submission orchestration.
 *
 * Mirrors the geo audit chain (`geo-submission.ts` → `enqueueNewJob`) with a
 * simpler contract: schema audits capture no lead and do not participate in
 * the single-flight dedupe, so submission is exactly:
 *
 *   1. Insert one `job_records` row with the authoritative column set
 *      (`id`, `job_identity`, `queue_name`, `correlation_id`, `target`,
 *      `status = 'queued'`) — the same columns the geo repository's
 *      `createJobRecord` writes. The `queue_name` column carries the service
 *      identifier `schema_audit` (geo uses `geo_audit` the same way); the
 *      result page filters on it.
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, url }` — the shape
 *      the schema worker (`apps/worker/src/queue/schema-worker.ts`)
 *      consumes. The queue name resolves as `SCHEMA_QUEUE_NAME` env →
 *      the `schema_audit_jobs` default; the worker resolves it as
 *      `options.queueName` → the same env → the same default, so both sides
 *      land on the same queue when the env is set consistently.
 */

/** BullMQ queue name the production schema worker consumes. */
export const SCHEMA_QUEUE_NAME = "schema_audit_jobs";

/** BullMQ job name for schema audit extraction. */
export const SCHEMA_JOB_NAME = "schema_audit";

/**
 * Value persisted in `job_records.queue_name` for schema audits. Matches the
 * geo convention of storing the service identifier (`geo_audit`) in the
 * `queue_name` column; the result page filters job rows on this value.
 */
export const SCHEMA_JOB_RECORD_QUEUE_NAME = "schema_audit";

/**
 * Queue name override env shared with the worker. Both sides resolve the
 * queue the same way — worker: `options.queueName` → this env →
 * `SCHEMA_QUEUE_NAME` default; submission: this env → the same default —
 * so setting the env in both environments keeps producer and consumer on the
 * same queue.
 */
const SCHEMA_QUEUE_NAME_ENV = "SCHEMA_QUEUE_NAME";

let schemaQueue: Queue | null = null;
let schemaQueueRedisUrl: string | null = null;

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `schema_audit_jobs`. The connection persists for the lifetime of the
 * process (standard for BullMQ producers) so repeated submissions do not open
 * a fresh Redis connection each time. The singleton is keyed by `redisUrl`;
 * passing a different URL re-creates the queue (mainly for tests).
 */
function getSchemaQueue(redisUrl: string, queueName: string): Queue {
  if (schemaQueue && schemaQueueRedisUrl === redisUrl) {
    return schemaQueue;
  }
  if (schemaQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void schemaQueue.close().catch(() => undefined);
  }
  schemaQueue = new Queue(queueName, { connection: { url: redisUrl } });
  schemaQueueRedisUrl = redisUrl;
  return schemaQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeSchemaSubmissionQueue(): Promise<void> {
  if (schemaQueue) {
    await schemaQueue.close().catch(() => undefined);
    schemaQueue = null;
    schemaQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetSchemaSubmissionQueueForTests(): void {
  schemaQueue = null;
  schemaQueueRedisUrl = null;
}

export interface SubmitSchemaAuditInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Canonical audit target URL. */
  url: string;
}

export interface SubmitSchemaAuditResult {
  /** The job_records id the caller should redirect to / poll. */
  jobId: string;
}

/**
 * Submits a schema audit: inserts the `job_records` row and enqueues the
 * BullMQ job. See the module docstring for the full contract.
 */
export async function submitSchemaAudit(
  input: SubmitSchemaAuditInput,
): Promise<SubmitSchemaAuditResult> {
  const { db, redisUrl, url } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')`,
    [jobId, jobIdentity, SCHEMA_JOB_RECORD_QUEUE_NAME, correlationId, url],
  );

  const queue = getSchemaQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(
      SCHEMA_JOB_NAME,
      { jobId, url },
      { jobId },
    );
  } catch (enqueueError) {
    // Orphaned-row compensation: the job_records INSERT above has already
    // committed, so a failed enqueue would leave a permanent 'queued' row no
    // worker will ever consume. Delete the orphaned row before rethrowing so
    // the caller sees the original enqueue error and no stale record remains.
    //
    // Long-term pattern: transactional outbox — persist the job_records row
    // and the enqueue intent in one DB transaction, then let a relay publish
    // to BullMQ. This DELETE compensation is the minimal correct fix until
    // that lands.
    try {
      await db.query(`DELETE FROM job_records WHERE id = $1`, [jobId]);
    } catch (compensationError) {
      // The original enqueue error remains the error contract; a failed
      // compensation is logged for operators instead of masking it.
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "schema-submission",
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
      layer: "schema-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[SCHEMA_QUEUE_NAME_ENV] ?? SCHEMA_QUEUE_NAME;
}
