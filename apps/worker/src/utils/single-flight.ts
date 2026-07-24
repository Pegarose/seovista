import { createHash } from "node:crypto";
import console from "node:console";
import { ensureCacheRedisReady } from "./render-cache.js";

/**
 * Single-flight request dedupe (Phase A — VAL-A-MIT-001 / VAL-A-MIT-002).
 *
 * Before enqueuing a new audit job the submission path attempts
 *   SET geo:lock:{sha256(canonicalUrl)} <jobId> NX EX 300
 * in Redis DB 1 (the same DB the render cache lives in — BullMQ stays on
 * DB 0 and MUST NOT bleed into DB 1). Only the submission that acquires the
 * lock creates a `job_records` row and enqueues a BullMQ job; every other
 * concurrent submission of the same canonical URL polls the existing
 * in-flight `job_records.status` row.
 *
 * The 300s TTL is the crash-hygiene backstop: if the worker process dies
 * mid-audit the lock auto-expires so the URL is not permanently pinned. On a
 * clean job completion (or failure) the geo-worker releases the lock early via
 * `releaseSingleFlightLock` (compare-and-delete) so a re-audit does not have
 * to wait the full TTL.
 *
 * All operations are fail-safe: if Redis is unreachable or no REDIS_URL is
 * configured, `acquireSingleFlightLock` returns `true` (degrade to the
 * pre-dedupe behavior) so the audit pipeline never blocks on the lock layer.
 */

/** Redis DB 1 key prefix for single-flight locks. */
export const SINGLE_FLIGHT_LOCK_PREFIX = "geo:lock:";

/** Lock TTL in seconds — wraps crash hygiene so a dead worker releases within 5 min. */
export const SINGLE_FLIGHT_LOCK_TTL_SECONDS = 300;

/**
 * Computes the bare canonical cache key for a URL: `sha256(canonicalUrl)` hex.
 * This is stored on `job_records.cache_key` and used as the lock suffix so the
 * lock and the durable Postgres lookup agree on identity.
 */
export function computeCanonicalCacheKey(canonicalUrl: string): string {
  return createHash("sha256").update(canonicalUrl, "utf8").digest("hex");
}

/**
 * Computes the Redis DB 1 lock key for a URL: `geo:lock:{sha256(canonicalUrl)}`.
 */
export function computeLockKey(canonicalUrl: string): string {
  return `${SINGLE_FLIGHT_LOCK_PREFIX}${computeCanonicalCacheKey(canonicalUrl)}`;
}

/**
 * Attempts to acquire the single-flight lock for `lockKey`.
 *
 * Semantics: `SET lockKey jobId NX EX ttlSeconds`. Returns `true` when this
 * caller acquired the lock (it is now the single in-flight writer), `false`
 * when the lock is already held by another submission.
 *
 * Degrades to `true` (acquired) when Redis is unavailable so the audit still
 * proceeds — single-flight is a trust optimization, not a hard gate that can
 * be allowed to block the whole pipeline when Redis is down.
 */
export async function acquireSingleFlightLock(
  lockKey: string,
  jobId: string,
  ttlSeconds: number = SINGLE_FLIGHT_LOCK_TTL_SECONDS,
): Promise<boolean> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return true;
  }
  try {
    const result = await redis.set(lockKey, jobId, "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch (err) {
    logLockEvent("lock_acquire_failed", lockKey, err);
    return true;
  }
}

/**
 * Releases the single-flight lock for `lockKey`, but only if the current lock
 * value equals `expectedJobId` (compare-and-delete via Lua). This prevents a
 * late release from a stale owner deleting a lock that has since been
 * re-acquired by a different submission after TTL expiry.
 *
 * Failures are logged and swallowed — the TTL is the authoritative release
 * path, so a failed explicit release never pins the URL.
 */
export async function releaseSingleFlightLock(
  lockKey: string,
  expectedJobId: string,
): Promise<void> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return;
  }
  try {
    // Compare-and-delete: only remove the lock if we still own it.
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      lockKey,
      expectedJobId,
    );
  } catch (err) {
    logLockEvent("lock_release_failed", lockKey, err);
  }
}

/**
 * Returns the current owner (lock value) for `lockKey`, or `null` when the
 * lock is free or Redis is unavailable. A deduped submission uses this to
 * recover the in-flight `job_records.id` directly from the lock value before
 * falling back to a `cache_key` Postgres lookup.
 */
export async function getSingleFlightLockOwner(
  lockKey: string,
): Promise<string | null> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return null;
  }
  try {
    const value = await redis.get(lockKey);
    return value ?? null;
  } catch (err) {
    logLockEvent("lock_owner_read_failed", lockKey, err);
    return null;
  }
}

/**
 * Inspects the lock TTL for `lockKey`. Returns the TTL in seconds (>= 0), or
 * `null` when the key does not exist or Redis is unavailable. Used by tests
 * and validators to assert VAL-A-MIT-002 (TTL <= 300).
 */
export async function getSingleFlightLockTtl(
  lockKey: string,
): Promise<number | null> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return null;
  }
  try {
    const ttl = await redis.ttl(lockKey);
    if (ttl === -2) {
      // Key does not exist.
      return null;
    }
    return ttl;
  } catch (err) {
    logLockEvent("lock_ttl_read_failed", lockKey, err);
    return null;
  }
}

function logLockEvent(event: string, lockKey: string, err: unknown): void {
  console.warn(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "single-flight",
      event,
      lockKey,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }),
  );
}
