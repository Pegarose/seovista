import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";

/**
 * Attribution trace submission orchestration.
 *
 * Mirrors the schema-truth / render-parity chain — no lead capture, no
 * single-flight dedupe; a submission is exactly:
 *
 *   1. Insert one `job_records` row with queue_name `attribution_trace_audit`
 *      and status `'queued'`.
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, url, answer }`.
 *
 * The worker fetches the target's home page via the SSRF-hardened fetcher,
 * optionally runs the configured SearXNG provider against the audited
 * domain's keyword, and calls the pure traceAttribution processor.
 */

/** BullMQ queue name the production attribution trace worker consumes. */
export const ATTRIBUTION_TRACE_QUEUE_NAME = "attribution_trace_audit_jobs";

/** BullMQ job name for attribution trace extraction. */
export const ATTRIBUTION_TRACE_JOB_NAME = "attribution_trace_audit";

/**
 * Value persisted in `job_records.queue_name` for attribution trace audits.
 * The result page filters `job_records` on this value.
 */
export const ATTRIBUTION_TRACE_JOB_RECORD_QUEUE_NAME = "attribution_trace_audit";

const ATTRIBUTION_TRACE_QUEUE_NAME_ENV = "ATTRIBUTION_TRACE_QUEUE_NAME";

let attributionTraceQueue: Queue | null = null;
let attributionTraceQueueRedisUrl: string | null = null;

function getAttributionTraceQueue(redisUrl: string, queueName: string): Queue {
  if (attributionTraceQueue && attributionTraceQueueRedisUrl === redisUrl) {
    return attributionTraceQueue;
  }
  if (attributionTraceQueue) {
    void attributionTraceQueue.close().catch(() => undefined);
  }
  attributionTraceQueue = new Queue(queueName, { connection: { url: redisUrl } });
  attributionTraceQueueRedisUrl = redisUrl;
  return attributionTraceQueue;
}

export async function closeAttributionTraceSubmissionQueue(): Promise<void> {
  if (attributionTraceQueue) {
    await attributionTraceQueue.close().catch(() => undefined);
    attributionTraceQueue = null;
    attributionTraceQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetAttributionTraceSubmissionQueueForTests(): void {
  attributionTraceQueue = null;
  attributionTraceQueueRedisUrl = null;
}

export interface SubmitAttributionTraceInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Canonical target domain (no scheme). */
  domain: string;
  /** Pasted AI answer. Already validated by the caller's zod schema. */
  answer: string;
  /** Optional search keyword to seed the SERP provider when configured. */
  keyword?: string;
}

export interface SubmitAttributionTraceResult {
  jobId: string;
}

export async function submitAttributionTraceCheck(
  input: SubmitAttributionTraceInput,
): Promise<SubmitAttributionTraceResult> {
  const { db, redisUrl, domain, answer, keyword } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')`,
    [jobId, jobIdentity, ATTRIBUTION_TRACE_JOB_RECORD_QUEUE_NAME, correlationId, domain],
  );

  const queue = getAttributionTraceQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(
      ATTRIBUTION_TRACE_JOB_NAME,
      { jobId, domain, answer, keyword },
      { jobId },
    );
  } catch (enqueueError) {
    try {
      await db.query(`DELETE FROM job_records WHERE id = $1`, [jobId]);
    } catch (compensationError) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "attribution-trace-submission",
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
      layer: "attribution-trace-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[ATTRIBUTION_TRACE_QUEUE_NAME_ENV] ?? ATTRIBUTION_TRACE_QUEUE_NAME;
}
