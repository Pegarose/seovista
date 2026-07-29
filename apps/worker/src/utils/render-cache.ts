import { createHash } from "node:crypto";
import IORedis, { type RedisOptions } from "ioredis";
import { type ParsedPage } from "@seovista/geo-engine";

/**
 * Render Cache (Phase A — Scoring Trust Foundation)
 *
 * Lives in Redis DB 1 alongside the single-flight lock (`geo:lock:{key}`) and
 * the daily Browseract credit counter (`browseract:credits:consumed:{date}`).
 * BullMQ continues to own DB 0; these trust keys MUST NOT bleed into DB 0.
 *
 * Key layout (Redis DB 1):
 *   geo:cache:{sha256(canonicalUrl)}                 EX <TTL_SECONDS>
 *   browseract:credits:consumed:{YYYY-MM-DD}         (no TTL — daily counter)
 *
 * All operations are fail-safe: if Redis is unreachable or no REDIS_URL is
 * configured, cache reads return `null` (cache miss) and writes/counter
 * increments log a warning and continue. The fetcher never crashes because
 * the cache layer is unavailable — it simply proceeds with a fresh render.
 */

/** Redis DB used for Phase A trust keys (cache, lock, credit counter). */
export const RENDER_CACHE_REDIS_DB = 1;

/** Key prefix for cached successful renders. */
export const RENDER_CACHE_KEY_PREFIX = "geo:cache:";

/** Key prefix for the daily Browseract credit counter. */
export const BROWSERACT_CREDIT_COUNTER_PREFIX = "browseract:credits:consumed:";

/** Default cache TTL in hours when `BROWSERACT_CACHE_TTL_HOURS` is unset/invalid. */
export const DEFAULT_CACHE_TTL_HOURS = 24;

/** Default daily Browseract credit cap when `BROWSERACT_DAILY_CREDIT_LIMIT` is unset/invalid. */
export const DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT = 4000;

let cacheRedisClient: IORedis | null = null;
let cacheRedisUnavailable = false;
/**
 * In-flight connect promise. Concurrent callers (e.g. 10 simultaneous form
 * submissions) all await the SAME promise so ioredis' `.connect()` is invoked
 * exactly once — without this guard, parallel `.connect()` calls throw
 * `Redis is already connecting/connected` and every caller degrades to a
 * graceful no-op, defeating the single-flight lock.
 */
let cacheRedisConnectPromise: Promise<IORedis | null> | null = null;

/**
 * Returns the configured cache TTL in seconds, derived from
 * `BROWSERACT_CACHE_TTL_HOURS` (default 24). A non-positive value disables
 * caching (writes become no-ops, reads always miss).
 */
export function getCacheTtlSeconds(): number {
  const raw = process.env.BROWSERACT_CACHE_TTL_HOURS;
  const parsed = raw !== undefined && raw.trim() !== "" ? Number(raw) : DEFAULT_CACHE_TTL_HOURS;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed * 3600);
}

/**
 * Returns the daily Browseract credit limit, derived from
 * `BROWSERACT_DAILY_CREDIT_LIMIT` (default 4000). A non-finite or negative
 * value falls back to the default so a misconfigured env var can never
 * disable the guard (VAL-A-MIT-003).
 */
export function getDailyCreditLimit(): number {
  const raw = process.env.BROWSERACT_DAILY_CREDIT_LIMIT;
  const parsed = raw !== undefined && raw.trim() !== "" ? Number(raw) : DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT;
  }
  return Math.floor(parsed);
}

/**
 * Computes the canonical cache key for a URL: `geo:cache:{sha256(canonicalUrl)}`.
 *
 * The canonical URL is the audit target URL exactly as passed to the fetcher
 * (no normalization) so that `sha256(canonicalUrl)` matches the audit's URL
 * one-to-one — see VAL-A-SPA-003.
 */
export function computeCacheKey(canonicalUrl: string): string {
  const hash = createHash("sha256").update(canonicalUrl, "utf8").digest("hex");
  return `${RENDER_CACHE_KEY_PREFIX}${hash}`;
}

/**
 * Returns the daily credit counter key for the current UTC date
 * (`browseract:credits:consumed:{YYYY-MM-DD}`).
 */
export function getDailyCreditCounterKey(date: Date = new Date()): string {
  const iso = date.toISOString();
  const yyyy = iso.slice(0, 4);
  const mm = iso.slice(5, 7);
  const dd = iso.slice(8, 10);
  return `${BROWSERACT_CREDIT_COUNTER_PREFIX}${yyyy}-${mm}-${dd}`;
}

/**
 * Parses `REDIS_URL` and forces the connection onto Redis DB 1
 * (`RENDER_CACHE_REDIS_DB`) regardless of the db segment in the URL.
 * Returns `null` when `REDIS_URL` is unset.
 */
function buildCacheRedisOptions(): RedisOptions | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }
  try {
    const parsed = new URL(redisUrl);
    const options: RedisOptions = {
      host: parsed.hostname || "127.0.0.1",
      port: parsed.port ? parseInt(parsed.port, 10) : 8637,
      db: RENDER_CACHE_REDIS_DB,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    };
    if (parsed.password) {
      options.password = decodeURIComponent(parsed.password);
    }
    return options;
  } catch {
    // Fall back to defaults targeting the mission's Redis port + DB 1.
    return {
      host: "127.0.0.1",
      port: 56379,
      db: RENDER_CACHE_REDIS_DB,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    };
  }
}

/**
 * Lazily creates and caches a singleton ioredis client pinned to DB 1.
 * Returns `null` when Redis is not configured or previously failed to connect
 * during this process (avoids retry storms on every fetch).
 */
export function getCacheRedis(): IORedis | null {
  if (cacheRedisUnavailable) {
    return null;
  }
  if (cacheRedisClient) {
    return cacheRedisClient;
  }
  const options = buildCacheRedisOptions();
  if (!options) {
    cacheRedisUnavailable = true;
    return null;
  }
  const client = new IORedis(options);
  client.on("error", (err) => {
    console.warn(
      JSON.stringify({
        name: "@seovista/worker",
        layer: "render-cache",
        event: "redis_error",
        error: err.message,
        timestamp: new Date().toISOString(),
      })
    );
  });
  cacheRedisClient = client;
  return client;
}

/**
 * Ensures the singleton cache Redis client is connected before issuing
 * commands, serializing the first connect so concurrent callers do not race
 * on ioredis' `.connect()` (which throws `Redis is already connecting/connected`
 * when invoked in parallel). Returns the ready client, or `null` when Redis is
 * not configured/unavailable. Subsequent calls return immediately once the
 * client reaches the `ready` state.
 */
export async function ensureCacheRedisReady(): Promise<IORedis | null> {
  const redis = getCacheRedis();
  if (!redis) {
    return null;
  }
  if (redis.status === "ready") {
    return redis;
  }
  if (!cacheRedisConnectPromise) {
    cacheRedisConnectPromise = (async () => {
      try {
        await redis.connect();
        return redis;
      } catch (err) {
        logCacheRedisError("connect_failed", err);
        // Mark unavailable so repeated attempts don't spin; reset clears it.
        cacheRedisUnavailable = true;
        cacheRedisClient = null;
        return null;
      } finally {
        cacheRedisConnectPromise = null;
      }
    })();
  }
  return cacheRedisConnectPromise;
}

function logCacheRedisError(event: string, err: unknown): void {
  console.warn(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "render-cache",
      event,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }),
  );
}

/**
 * Reads a cached `ParsedPage` for the given cache key.
 * Returns `null` on miss, disabled cache, or Redis failure (graceful miss).
 */
export async function getCachedRender(cacheKey: string): Promise<ParsedPage | null> {
  if (getCacheTtlSeconds() <= 0) {
    return null;
  }
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return null;
  }
  try {
    const raw = await redis.get(cacheKey);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ParsedPage;
  } catch (err) {
    console.warn(
      JSON.stringify({
        name: "@seovista/worker",
        layer: "render-cache",
        event: "cache_read_failed",
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
    return null;
  }
}

/**
 * Stores a successful render in the cache with the configured TTL.
 * No-op when the TTL is non-positive or Redis is unavailable.
 */
export async function setCachedRender(cacheKey: string, parsedPage: ParsedPage): Promise<void> {
  const ttl = getCacheTtlSeconds();
  if (ttl <= 0) {
    return;
  }
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return;
  }
  try {
    await redis.set(cacheKey, JSON.stringify(parsedPage), "EX", ttl);
  } catch (err) {
    console.warn(
      JSON.stringify({
        name: "@seovista/worker",
        layer: "render-cache",
        event: "cache_write_failed",
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }
}

/**
 * Increments the daily Browseract credit counter in Redis DB 1.
 * Failures are logged and swallowed — credit accounting must not break the
 * audit pipeline. The counter carries no TTL (it rolls over by date).
 */
export async function incrementBrowseractCreditCounter(): Promise<void> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return;
  }
  const counterKey = getDailyCreditCounterKey();
  try {
    await redis.incr(counterKey);
  } catch (err) {
    console.warn(
      JSON.stringify({
        name: "@seovista/worker",
        layer: "render-cache",
        event: "credit_counter_increment_failed",
        counterKey,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
  }
}

/**
 * Reads the current daily Browseract credit counter value from Redis DB 1.
 * Returns `0` on a missing key, Redis unavailability, or parse failure so the
 * credit guard (VAL-A-MIT-003) degrades to "under limit" when Redis is down
 * — the audit pipeline never blocks on credit accounting.
 */
export async function getDailyCreditConsumed(): Promise<number> {
  const redis = await ensureCacheRedisReady();
  if (!redis) {
    return 0;
  }
  const counterKey = getDailyCreditCounterKey();
  try {
    const raw = await redis.get(counterKey);
    if (!raw) {
      return 0;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (err) {
    logCacheRedisError("credit_counter_read_failed", err);
    return 0;
  }
}

/**
 * Closes the singleton cache Redis client. Called on worker shutdown.
 */
export async function closeCacheRedis(): Promise<void> {
  if (cacheRedisClient) {
    try {
      await cacheRedisClient.quit();
    } catch {
      // Best-effort close.
    }
    cacheRedisClient = null;
  }
  cacheRedisConnectPromise = null;
}

/**
 * Resets the singleton state. Intended for unit tests that need to inject
 * a fresh client or simulate Redis unavailability.
 */
export function __resetCacheRedisForTests(): void {
  cacheRedisClient = null;
  cacheRedisUnavailable = false;
  cacheRedisConnectPromise = null;
}
