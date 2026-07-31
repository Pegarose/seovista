import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";
import type { SerpLocale } from "@seovista/seo-core";

/**
 * Keyword rank check submission orchestration.
 *
 * Mirrors the schema audit chain (`schema-submission.ts`) with the same
 * simpler contract: keyword rank checks capture no lead and do not
 * participate in the single-flight dedupe, so submission is exactly:
 *
 *   1. Insert one `job_records` row with the authoritative column set
 *      (`id`, `job_identity`, `queue_name`, `correlation_id`, `target`,
 *      `status = 'queued'`) — the same columns the geo repository's
 *      `createJobRecord` writes. The `queue_name` column carries the service
 *      identifier `keyword_rank_audit` (geo uses `geo_audit`, schema uses
 *      `schema_audit` the same way); the result page filters on it. The
 *      `target` column carries the checked domain.
 *   2. Enqueue exactly one BullMQ job carrying `{ jobId, domain, keyword,
 *      locale }` — the shape the keyword rank worker
 *      (`apps/worker/src/queue/keyword-rank-worker.ts`) consumes. The queue
 *      name resolves as `KEYWORD_RANK_QUEUE_NAME` env → the
 *      `keyword_rank_jobs` default; the worker resolves it as
 *      `options.queueName` → the same env → the same default, so both sides
 *      land on the same queue when the env is set consistently.
 */

/** BullMQ queue name the production keyword rank worker consumes. */
export const KEYWORD_RANK_QUEUE_NAME = "keyword_rank_jobs";

/** BullMQ job name for keyword rank checks. */
export const KEYWORD_RANK_JOB_NAME = "keyword_rank";

/**
 * Value persisted in `job_records.queue_name` for keyword rank checks.
 * Matches the geo/schema convention of storing the service identifier in the
 * `queue_name` column; the result page filters job rows on this value.
 */
export const KEYWORD_RANK_JOB_RECORD_QUEUE_NAME = "keyword_rank_audit";

/**
 * Queue name override env shared with the worker. Both sides resolve the
 * queue the same way — worker: `options.queueName` → this env →
 * `KEYWORD_RANK_QUEUE_NAME` default; submission: this env → the same
 * default — so setting the env in both environments keeps producer and
 * consumer on the same queue.
 */
const KEYWORD_RANK_QUEUE_NAME_ENV = "KEYWORD_RANK_QUEUE_NAME";

let keywordRankQueue: Queue | null = null;
let keywordRankQueueRedisUrl: string | null = null;

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `keyword_rank_jobs`. The connection persists for the lifetime of the
 * process (standard for BullMQ producers) so repeated submissions do not open
 * a fresh Redis connection each time. The singleton is keyed by `redisUrl`;
 * passing a different URL re-creates the queue (mainly for tests).
 */
function getKeywordRankQueue(redisUrl: string, queueName: string): Queue {
  if (keywordRankQueue && keywordRankQueueRedisUrl === redisUrl) {
    return keywordRankQueue;
  }
  if (keywordRankQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void keywordRankQueue.close().catch(() => undefined);
  }
  keywordRankQueue = new Queue(queueName, { connection: { url: redisUrl } });
  keywordRankQueueRedisUrl = redisUrl;
  return keywordRankQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeKeywordRankSubmissionQueue(): Promise<void> {
  if (keywordRankQueue) {
    await keywordRankQueue.close().catch(() => undefined);
    keywordRankQueue = null;
    keywordRankQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetKeywordRankSubmissionQueueForTests(): void {
  keywordRankQueue = null;
  keywordRankQueueRedisUrl = null;
}

export interface SubmitKeywordRankCheckInput {
  /** DB client used to insert the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Public domain whose ranking is checked (becomes job_records.target). */
  domain: string;
  /** Keyword to check the ranking for. */
  keyword: string;
  /** Search locale for the SearXNG query. */
  locale: SerpLocale;
}

export interface SubmitKeywordRankCheckResult {
  /** The job_records id the caller should redirect to / poll. */
  jobId: string;
}

/**
 * Submits a keyword rank check: inserts the `job_records` row and enqueues
 * the BullMQ job. See the module docstring for the full contract.
 */
export async function submitKeywordRankCheck(
  input: SubmitKeywordRankCheckInput,
): Promise<SubmitKeywordRankCheckResult> {
  const { db, redisUrl, domain, keyword, locale } = input;

  const jobId = randomUUID();
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  await db.query(
    `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, $5, 'queued')`,
    [jobId, jobIdentity, KEYWORD_RANK_JOB_RECORD_QUEUE_NAME, correlationId, domain],
  );

  const queue = getKeywordRankQueue(redisUrl, resolveQueueName());
  try {
    await queue.add(
      KEYWORD_RANK_JOB_NAME,
      { jobId, domain, keyword, locale },
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
          layer: "keyword-rank-submission",
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
      layer: "keyword-rank-submission",
      event: "enqueued",
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );

  return { jobId };
}

function resolveQueueName(): string {
  return process.env[KEYWORD_RANK_QUEUE_NAME_ENV] ?? KEYWORD_RANK_QUEUE_NAME;
}
