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
 *   2. Enqueue exactly one BullMQ job on `schema_audit_jobs` carrying
 *      `{ jobId, url }` — the shape the schema worker
 *      (`apps/worker/src/queue/schema-worker.ts`) consumes.
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

/** Default queue name override env (matches the worker's `startSchemaWorker`). */
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
  await queue.add(
    SCHEMA_JOB_NAME,
    { jobId, url },
    { jobId },
  );

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
