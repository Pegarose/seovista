import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import type { TestEnvironment } from "./helpers/test-env.js";
import { setupTestEnvironment } from "./helpers/test-env.js";
import {
  submitGeoAudit,
  closeGeoSubmissionQueue,
  __resetGeoSubmissionQueueForTests,
} from "../queue/geo-submission.js";
import {
  computeLockKey,
  computeCanonicalCacheKey,
  getSingleFlightLockOwner,
  getSingleFlightLockTtl,
  SINGLE_FLIGHT_LOCK_TTL_SECONDS,
} from "../utils/single-flight.js";
import {
  closeCacheRedis,
  __resetCacheRedisForTests,
  RENDER_CACHE_REDIS_DB,
} from "../utils/render-cache.js";
import { createGeoAuditRepository } from "../db/geo-audit-repository.js";

const REDIS_HOST = "127.0.0.1";
const REDIS_PORT = 8637;

async function redisAvailable(): Promise<boolean> {
  const client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: RENDER_CACHE_REDIS_DB,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    await client.quit().catch(() => undefined);
  }
}

/**
 * Removes all `geo:lock:*` keys from Redis DB 1 so each test starts from a
 * clean lock state. DB 0 (BullMQ) is never touched.
 */
async function deleteDb1LockKeys(): Promise<void> {
  const client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: RENDER_CACHE_REDIS_DB,
    lazyConnect: true,
  });
  try {
    await client.connect();
    let cursor = "0";
    do {
      const [next, keys] = await client.scan(cursor, "MATCH", "geo:lock:*", "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== "0");
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function getDb1KeyTtl(key: string): Promise<number | null> {
  const client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: RENDER_CACHE_REDIS_DB,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const ttl = await client.ttl(key);
    if (ttl === -2) return null;
    return ttl;
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function deleteDb1Key(key: string): Promise<void> {
  const client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    db: RENDER_CACHE_REDIS_DB,
    lazyConnect: true,
  });
  try {
    await client.connect();
    await client.del(key);
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function createLead(env: TestEnvironment, url: string): Promise<{ id: string }> {
  const repo = createGeoAuditRepository(env.db);
  const lead = await repo.createLead({
    domain: url,
    brandName: "Test Brand",
    primaryMarket: "TR",
  });
  return { id: lead.id };
}

describe("single-flight request dedupe (VAL-A-MIT-001 / VAL-A-MIT-002)", () => {
  let env: TestEnvironment;
  let queueName: string;
  let queue: Queue;

  beforeEach(async () => {
    env = await setupTestEnvironment();
    process.env.DATABASE_URL = env.databaseUrl;
    process.env.REDIS_URL = env.redisUrl;
    queueName = `geo_readiness_jobs_${env.projectId}`;
    // Unique queue name so a production worker on the default queue cannot
    // steal this test's enqueued jobs.
    process.env.GEO_QUEUE_NAME = queueName;
    // Keep the deterministic cheerio fetch path off the table; these tests
    // never run the worker, so external provider env is irrelevant.
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.NEURONWRITER_API_KEY;
    delete process.env.CREW_AGENCY_API_KEY;
    __resetCacheRedisForTests();
    __resetGeoSubmissionQueueForTests();
    queue = new Queue(queueName, { connection: { url: env.redisUrl } });
  });

  afterEach(async () => {
    await queue.close().catch(() => undefined);
    await closeGeoSubmissionQueue();
    await closeCacheRedis();
    __resetCacheRedisForTests();
    __resetGeoSubmissionQueueForTests();
    delete process.env.GEO_QUEUE_NAME;
    await deleteDb1LockKeys();
    await env.cleanup();
  });

  it("10 concurrent submissions of the same URL produce exactly ONE job_records row and ONE BullMQ job (VAL-A-MIT-001)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping dedupe test");
      return;
    }
    const url = "https://example.com/";
    const lead = await createLead(env, url);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url, leadId: lead.id }),
      ),
    );

    // Every submission converges on the same in-flight job id.
    const jobIds = new Set(results.map((r) => r.jobId));
    expect(jobIds.size).toBe(1);

    // Exactly one submission enqueued; the other nine were deduped.
    const enqueued = results.filter((r) => !r.deduped);
    const deduped = results.filter((r) => r.deduped);
    expect(enqueued).toHaveLength(1);
    expect(deduped).toHaveLength(9);

    // Exactly one job_records row for this canonical cache key.
    const cacheKey = computeCanonicalCacheKey(url);
    const countRes = await env.db.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM job_records WHERE cache_key = $1",
      [cacheKey],
    );
    expect(countRes.rows[0]!.cnt).toBe(1);

    // Exactly one BullMQ job was enqueued on the dedupe queue.
    const counts = await queue.getJobCounts();
    const totalEnqueued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    expect(totalEnqueued).toBe(1);

    // The single enqueued BullMQ job carries the converged job id.
    const jobId = results[0]!.jobId;
    const bullJob = await queue.getJob(jobId);
    expect(bullJob).not.toBeNull();
    expect(bullJob?.data.jobId).toBe(jobId);
  });

  it("the single-flight lock TTL is 300 seconds (VAL-A-MIT-002)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping TTL test");
      return;
    }
    expect(SINGLE_FLIGHT_LOCK_TTL_SECONDS).toBe(300);

    const url = "https://ttl-test.example.com/";
    const lead = await createLead(env, url);
    await submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url, leadId: lead.id });

    const lockKey = computeLockKey(url);
    const ttl = await getSingleFlightLockTtl(lockKey);
    expect(ttl).not.toBeNull();
    expect(ttl!).toBeLessThanOrEqual(300);
    expect(ttl!).toBeGreaterThan(0);

    // Cross-check via a raw DB 1 client (independent of the module singleton).
    const rawTtl = await getDb1KeyTtl(lockKey);
    expect(rawTtl).not.toBeNull();
    expect(rawTtl!).toBeLessThanOrEqual(300);
  });

  it("manually deleting the lock simulates a crash release path — a new audit can proceed (VAL-A-MIT-002)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping crash-release test");
      return;
    }
    const url = "https://crash-test.example.com/";
    const lead = await createLead(env, url);
    const lockKey = computeLockKey(url);

    // First submission acquires the lock and creates the in-flight job.
    const first = await submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url, leadId: lead.id });
    expect(first.deduped).toBe(false);
    expect(await getSingleFlightLockOwner(lockKey)).toBe(first.jobId);

    // A second concurrent submission is deduped onto the in-flight job.
    const second = await submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url, leadId: lead.id });
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);

    // Simulate a crash: manually delete the lock (what the 300s TTL would do
    // automatically after a dead worker).
    await deleteDb1Key(lockKey);
    expect(await getSingleFlightLockOwner(lockKey)).toBeNull();

    // After the lock is gone, a new submission can acquire a fresh lock and
    // create a new audit job (the crash release path).
    const third = await submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url, leadId: lead.id });
    expect(third.deduped).toBe(false);
    expect(third.jobId).not.toBe(first.jobId);
  });

  it("different canonical URLs do not block each other (cacheKey is URL-specific)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping cross-URL test");
      return;
    }
    const urlA = "https://site-a.example.com/";
    const urlB = "https://site-b.example.com/";
    const leadA = await createLead(env, urlA);
    const leadB = await createLead(env, urlB);

    const [a, b] = await Promise.all([
      submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url: urlA, leadId: leadA.id }),
      submitGeoAudit({ db: env.db, redisUrl: env.redisUrl, url: urlB, leadId: leadB.id }),
    ]);

    // Two distinct URLs → two distinct in-flight jobs, neither deduped.
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
    expect(a.jobId).not.toBe(b.jobId);

    // Two job_records rows, one per cache_key.
    const cacheKeyA = computeCanonicalCacheKey(urlA);
    const cacheKeyB = computeCanonicalCacheKey(urlB);
    const countA = await env.db.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM job_records WHERE cache_key = $1",
      [cacheKeyA],
    );
    const countB = await env.db.query<{ cnt: number }>(
      "SELECT COUNT(*)::int AS cnt FROM job_records WHERE cache_key = $1",
      [cacheKeyB],
    );
    expect(countA.rows[0]!.cnt).toBe(1);
    expect(countB.rows[0]!.cnt).toBe(1);

    // Two distinct locks held in DB 1.
    expect(await getSingleFlightLockOwner(computeLockKey(urlA))).toBe(a.jobId);
    expect(await getSingleFlightLockOwner(computeLockKey(urlB))).toBe(b.jobId);

    // Two BullMQ jobs enqueued.
    const counts = await queue.getJobCounts();
    const totalEnqueued =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    expect(totalEnqueued).toBe(2);
  });

  it("findInFlightJobByCacheKey only matches non-terminal rows", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping terminal-row test");
      return;
    }
    const repo = createGeoAuditRepository(env.db);
    const url = "https://terminal.example.com/";
    const cacheKey = computeCanonicalCacheKey(url);
    const lead = await createLead(env, url);

    // Insert a completed job_records row directly (bypasses the BEFORE UPDATE
    // transition trigger, which would reject queued→completed). A completed
    // row must NOT be treated as in-flight by the dedupe lookup.
    await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, correlation_id, target, status, lead_id, cache_key, completed_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6, now())`,
      [randomUUID(), "geo_audit", randomUUID(), url, lead.id, cacheKey],
    );

    // A completed row must NOT be returned as in-flight.
    expect(await repo.findInFlightJobByCacheKey(cacheKey)).toBeNull();

    // And a fresh submission (lock free) creates a NEW job rather than
    // deduping onto the completed row.
    const result = await submitGeoAudit({
      db: env.db,
      redisUrl: env.redisUrl,
      url,
      leadId: lead.id,
    });
    expect(result.deduped).toBe(false);
    expect(result.jobId).not.toBe(
      (
        await env.db.query<{ id: string }>(
          "SELECT id FROM job_records WHERE cache_key = $1 AND status = 'completed'",
          [cacheKey],
        )
      ).rows[0]!.id,
    );
  });
});
