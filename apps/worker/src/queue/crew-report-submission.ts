import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";
import type { CrewReportTool } from "../processors/crew-report.js";

/**
 * Crew report submission orchestration.
 *
 * Mirrors the keyword rank chain (`keyword-rank-submission.ts`) with the same
 * contract: crew reports capture their lead on the web side before
 * submission and do not participate in the single-flight dedupe, so
 * submission is exactly:
 *
 *   1. Insert one `job_records` row with the authoritative column set
 *      (`id`, `job_identity`, `queue_name`, `correlation_id`, `target`,
 *      `lead_id`, `status = 'queued'`) — the same columns the geo
 *      repository's `createJobRecord` writes. The `queue_name` column
 *      carries the service identifier `crew_report`; the status action
 *      filters on it. The `target` column carries the source job id the
 *      report is generated from. The `lead_id` column carries the lead
 *      captured on the web side before submission so the repository's
 *      `updateLeadEmailForJob` can join `job_records.lead_id` when the
 *      email is persisted.
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, sourceJobId, tool }`
 *      — the shape the crew report worker
 *      (`apps/worker/src/queue/crew-report-worker.ts`) consumes. The queue
 *      name resolves as `CREW_REPORT_QUEUE_NAME` env → the
 *      `crew_report_jobs` default; the worker resolves it as
 *      `options.queueName` → the same env → the same default, so both sides
 *      land on the same queue when the env is set consistently.
 */

/** BullMQ queue name the production crew report worker consumes. */
export const CREW_REPORT_QUEUE_NAME = "crew_report_jobs";

/** BullMQ job name for crew reports. */
export const CREW_REPORT_JOB_NAME = "crew_report";

/**
 * Value persisted in `job_records.queue_name` for crew reports. Matches the
 * geo/schema/keyword-rank convention of storing the service identifier in
 * the `queue_name` column; the status action filters job rows on this value.
 */
export const CREW_REPORT_JOB_RECORD_QUEUE_NAME = "crew_report";

/**
 * Queue name override env shared with the worker. Both sides resolve the
 * queue the same way — worker: `options.queueName` → this env →
 * `CREW_REPORT_QUEUE_NAME` default; submission: this env → the same
 * default — so setting the env in both environments keeps producer and
 * consumer on the same queue.
 */
const CREW_REPORT_QUEUE_NAME_ENV = "CREW_REPORT_QUEUE_NAME";

let crewReportQueue: Queue | null = null;
let crewReportQueueRedisUrl: string | null = null;

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `crew_report_jobs`. The connection persists for the lifetime of the
 * process (standard for BullMQ producers) so repeated submissions do not open
 * a fresh Redis connection each time. The singleton is keyed by `redisUrl`;
 * passing a different URL re-creates the queue (mainly for tests).
 */
function getCrewReportQueue(redisUrl: string, queueName: string): Queue {
  if (crewReportQueue && crewReportQueueRedisUrl === redisUrl) {
    return crewReportQueue;
  }
  if (crewReportQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void crewReportQueue.close().catch(() => undefined);
  }
  crewReportQueue = new Queue(queueName, { connection: { url: redisUrl } });
  crewReportQueueRedisUrl = redisUrl;
  return crewReportQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeCrewReportSubmissionQueue(): Promise<void> {
  if (crewReportQueue) {
    await crewReportQueue.close().catch(() => undefined);
    crewReportQueue = null;
    crewReportQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetCrewReportSubmissionQueueForTests(): void {
  crewReportQueue = null;
  crewReportQueueRedisUrl = null;
}

export interface SubmitCrewReportInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** The completed source audit job the report is generated from. */
  sourceJobId: string;
  /**
   * Lead id captured by the form action before calling submit. Stored on the
   * job_records row (`lead_id`) exactly like the geo chain; the BullMQ job
   * payload does not carry it.
   */
  leadId: string;
  /** Tool whose source result seeds the report. */
  tool: CrewReportTool;
}

export interface SubmitCrewReportResult {
  /** The job_records id the caller should poll. */
  jobId: string;
}

/**
 * Submits a crew report: inserts the `job_records` row and enqueues the
 * BullMQ job. See the module docstring for the full contract.
 */
export async function submitCrewReport(
  input: SubmitCrewReportInput,
): Promise<SubmitCrewReportResult> {
  const { db, redisUrl, sourceJobId, leadId, tool } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, lead_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
    [jobId, jobIdentity, CREW_REPORT_JOB_RECORD_QUEUE_NAME, correlationId, sourceJobId, leadId],
  );

  const queue = getCrewReportQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(
      CREW_REPORT_JOB_NAME,
      { jobId, sourceJobId, tool },
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
          layer: "crew-report-submission",
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
      layer: "crew-report-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[CREW_REPORT_QUEUE_NAME_ENV] ?? CREW_REPORT_QUEUE_NAME;
}
