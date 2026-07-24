import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";
import type { DbClient } from "../db/client.js";
import { createGeoAuditRepository } from "../db/geo-audit-repository.js";
import {
  computeCanonicalCacheKey,
  computeLockKey,
  acquireSingleFlightLock,
  getSingleFlightLockOwner,
  SINGLE_FLIGHT_LOCK_TTL_SECONDS,
} from "../utils/single-flight.js";

/**
 * Single-flight audit submission orchestration (VAL-A-MIT-001 / VAL-A-MIT-002).
 *
 * Replaces the form-action's previous "create a job_records row and hope the
 * worker polls it" pattern with a single atomic-ish entry point that:
 *
 *   1. Computes `sha256(canonicalUrl)` as the dedupe identity.
 *   2. Attempts `SET geo:lock:{key} <jobId> NX EX 300` in Redis DB 1.
 *   3. On acquisition: inserts one `job_records` row (with `cache_key`) and
 *      enqueues exactly one BullMQ job on `geo_readiness_jobs`.
 *   4. On lock-held: locates the in-flight `job_records` row (via the lock
 *      value, falling back to a `cache_key` Postgres lookup) and returns its
 *      id so the caller's client polls `job_records.status` instead of
 *      enqueuing a duplicate.
 *
 * The BullMQ queue name matches the production geo-worker default
 * (`geo_readiness_jobs`) so the enqueued job is picked up by the worker
 * started in `apps/worker/src/queue/geo-worker.ts`.
 */

/** BullMQ queue name the production geo-worker consumes. */
export const GEO_QUEUE_NAME = "geo_readiness_jobs";

/** BullMQ job name for geo audit scoring. */
export const GEO_JOB_NAME = "geo_score";

/** Default queue name override env (matches the worker's `startGeoWorker`). */
const GEO_QUEUE_NAME_ENV = "GEO_QUEUE_NAME";

/** Maximum number of polls while waiting for a lock owner to publish its job_records row. */
const LOCK_OWNER_RECORD_APPEARANCE_MAX_ATTEMPTS = 10;
/** Delay between polls while waiting for the lock owner's job_records row to appear. */
const LOCK_OWNER_RECORD_APPEARANCE_DELAY_MS = 50;

let geoQueue: Queue | null = null;
let geoQueueRedisUrl: string | null = null;

/**
 * Lazily creates and caches a singleton BullMQ Queue producer for
 * `geo_readiness_jobs`. The connection persists for the lifetime of the
 * process (standard for BullMQ producers) so repeated submissions do not open
 * a fresh Redis connection each time. The singleton is keyed by `redisUrl`;
 * passing a different URL re-creates the queue (mainly for tests).
 */
function getGeoQueue(redisUrl: string, queueName: string): Queue {
  if (geoQueue && geoQueueRedisUrl === redisUrl) {
    return geoQueue;
  }
  if (geoQueue) {
    // URL changed (test scenario) — close the previous producer first.
    void geoQueue.close().catch(() => undefined);
  }
  geoQueue = new Queue(queueName, { connection: { url: redisUrl } });
  geoQueueRedisUrl = redisUrl;
  return geoQueue;
}

/**
 * Closes the cached BullMQ Queue producer. Intended for tests and worker
 * shutdown; production callers leave it open for the process lifetime.
 */
export async function closeGeoSubmissionQueue(): Promise<void> {
  if (geoQueue) {
    await geoQueue.close().catch(() => undefined);
    geoQueue = null;
    geoQueueRedisUrl = null;
  }
}

/** Resets the singleton state. Intended for unit tests. */
export function __resetGeoSubmissionQueueForTests(): void {
  geoQueue = null;
  geoQueueRedisUrl = null;
}

export interface SubmitGeoAuditInput {
  /** DB client used to insert / look up the job_records row. */
  db: DbClient;
  /** Redis URL for the BullMQ queue (DB 0 — BullMQ owns it). */
  redisUrl: string;
  /** Canonical audit target URL. Dedupe is keyed on this exact string. */
  url: string;
  /** Lead id captured by the form action before calling submit. */
  leadId: string;
  /** When true, the audit bypasses the render cache (handled by the fetcher). */
  forceAudit?: boolean;
}

export interface SubmitGeoAuditResult {
  /** The job_records id the caller should redirect to / poll. */
  jobId: string;
  /** `true` when this submission was deduped onto an in-flight job. */
  deduped: boolean;
}

/**
 * Thrown when the single-flight lock is held but no in-flight job_records row
 * can be recovered and the lock could not be re-acquired. The caller should
 * retry shortly — the lock WILL expire within `SINGLE_FLIGHT_LOCK_TTL_SECONDS`.
 */
export class SingleFlightLockBusyError extends Error {
  constructor(
    readonly cacheKey: string,
    readonly lockKey: string,
  ) {
    super(
      `Single-flight lock held for cache key ${cacheKey} but no in-flight job record recovered; retry within ${SINGLE_FLIGHT_LOCK_TTL_SECONDS}s`,
    );
    this.name = "SingleFlightLockBusyError";
  }
}

/**
 * Submits a geo audit with single-flight dedupe.
 *
 * On the "acquired" path: creates one `job_records` row (id pre-generated and
 * written into the Redis lock value) and enqueues one BullMQ job. On the
 * "deduped" path: returns the in-flight job id without creating a row or
 * enqueuing. See the module docstring for the full flow.
 */
export async function submitGeoAudit(
  input: SubmitGeoAuditInput,
): Promise<SubmitGeoAuditResult> {
  const { db, redisUrl, url, leadId, forceAudit } = input;
  const repo = createGeoAuditRepository(db);
  const cacheKey = computeCanonicalCacheKey(url);
  const lockKey = computeLockKey(url);
  const queueName = resolveQueueName();

  // Pre-generate the job_records id so it can be written into the lock value
  // BEFORE the row is inserted — a concurrent deduped submission can then
  // recover the in-flight id directly from the lock.
  const prospectiveJobId = randomUUID();

  const acquired = await acquireSingleFlightLock(lockKey, prospectiveJobId);

  if (acquired) {
    return enqueueNewJob({
      db,
      redisUrl,
      url,
      leadId,
      cacheKey,
      lockKey,
      jobId: prospectiveJobId,
      forceAudit: forceAudit === true,
      queueName,
    });
  }

  // Lock held → an in-flight audit exists for this URL. Subscribe to its
  // job_records.status (poll) instead of enqueuing a duplicate.
  const dedupedJobId = await recoverInFlightJobId(repo, cacheKey, lockKey);
  if (dedupedJobId) {
    logSubmission("deduped", cacheKey, lockKey, dedupedJobId);
    return { jobId: dedupedJobId, deduped: true };
  }

  // Edge case: lock held but no recoverable job record. The owner likely
  // crashed between lock-acquire and record-insert, OR the TTL expired and a
  // new owner is mid-insert. Attempt to acquire the lock ourselves; if we get
  // it, proceed to create a fresh job (the stale owner's lock is gone). If we
  // still cannot acquire, surface a transient busy error so the caller can
  // retry within the TTL window.
  const retryJobId = randomUUID();
  const retryAcquired = await acquireSingleFlightLock(lockKey, retryJobId);
  if (retryAcquired) {
    logSubmission("recovered_stale_lock", cacheKey, lockKey, retryJobId);
    return enqueueNewJob({
      db,
      redisUrl,
      url,
      leadId,
      cacheKey,
      lockKey,
      jobId: retryJobId,
      forceAudit: forceAudit === true,
      queueName,
    });
  }

  throw new SingleFlightLockBusyError(cacheKey, lockKey);
}

/**
 * Inserts the job_records row (with the pre-generated id + cache_key) and
 * enqueues the BullMQ job. The BullMQ job carries `{ jobId, url, forceAudit }`
 * — exactly the shape the production geo-worker (`geo-worker.ts`) consumes.
 */
async function enqueueNewJob(args: {
  db: DbClient;
  redisUrl: string;
  url: string;
  leadId: string;
  cacheKey: string;
  lockKey: string;
  jobId: string;
  forceAudit: boolean;
  queueName: string;
}): Promise<SubmitGeoAuditResult> {
  const { db, redisUrl, url, leadId, cacheKey, lockKey, jobId, forceAudit, queueName } = args;
  const repo = createGeoAuditRepository(db);

  const insertedId = await repo.createJobRecord({
    id: jobId,
    target: url,
    service: "geo_audit",
    status: "queued",
    leadId,
    cacheKey,
  });

  // If Postgres returned a different id (it should not, since we passed an
  // explicit id, but guard against a future schema change) prefer the DB's
  // value and update the lock owner so deduped submissions recover the right id.
  const effectiveJobId = insertedId === jobId ? jobId : insertedId;
  if (effectiveJobId !== jobId) {
    // Re-write the lock value to the actual id, preserving the remaining TTL.
    // This is best-effort; the cache_key fallback covers any race.
    await rewriteLockOwner(lockKey, effectiveJobId);
  }

  const queue = getGeoQueue(redisUrl, queueName);
  await queue.add(
    GEO_JOB_NAME,
    { jobId: effectiveJobId, url, forceAudit },
    { jobId: effectiveJobId },
  );

  logSubmission("enqueued", cacheKey, lockKey, effectiveJobId);
  return { jobId: effectiveJobId, deduped: false };
}

/**
 * Recovers the in-flight job_records id when the lock is held. First reads the
 * lock value (the owner's pre-generated id) and confirms a row exists for it;
 * if the owner has not yet inserted its row (tiny race window), polls a few
 * times before falling back to a `cache_key` Postgres lookup.
 */
async function recoverInFlightJobId(
  repo: ReturnType<typeof createGeoAuditRepository>,
  cacheKey: string,
  lockKey: string,
): Promise<string | null> {
  const ownerJobId = await getSingleFlightLockOwner(lockKey);
  if (ownerJobId) {
    // Optimistic fast path: the lock value IS the in-flight job id.
    const row = await repo.getJobRecord(ownerJobId);
    if (row) {
      return ownerJobId;
    }
    // The owner acquired the lock but has not yet committed its job_records
    // row. Poll briefly for the row to appear.
    for (let attempt = 0; attempt < LOCK_OWNER_RECORD_APPEARANCE_MAX_ATTEMPTS; attempt++) {
      await sleep(LOCK_OWNER_RECORD_APPEARANCE_DELAY_MS);
      const retryRow = await repo.getJobRecord(ownerJobId);
      if (retryRow) {
        return ownerJobId;
      }
    }
  }

  // Fallback: locate the in-flight row by cache_key (survives a lock value
  // that does not match any row, e.g. after a stale-lock recovery).
  return repo.findInFlightJobByCacheKey(cacheKey);
}

/**
 * Best-effort re-write of the lock owner value, preserving the remaining TTL.
 * Used only when Postgres returned a different id than the pre-generated one
 * (defensive — should not happen with an explicit id insert).
 */
async function rewriteLockOwner(lockKey: string, jobId: string): Promise<void> {
  // Inline import to avoid a circular dependency at module load time.
  const { ensureCacheRedisReady } = await import("../utils/render-cache.js");
  const redis = await ensureCacheRedisReady();
  if (!redis) return;
  try {
    const ttl = await redis.ttl(lockKey);
    if (ttl > 0) {
      await redis.set(lockKey, jobId, "EX", ttl);
    }
  } catch {
    // Best-effort; cache_key fallback covers any race.
  }
}

function resolveQueueName(): string {
  return process.env[GEO_QUEUE_NAME_ENV] ?? GEO_QUEUE_NAME;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logSubmission(event: string, cacheKey: string, lockKey: string, jobId: string): void {
  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "geo-submission",
      event,
      cacheKey,
      lockKey,
      jobId,
      timestamp: new Date().toISOString(),
    }),
  );
}
