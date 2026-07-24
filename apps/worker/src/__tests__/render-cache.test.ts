import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import IORedis from "ioredis";
import {
  computeCacheKey,
  getCacheTtlSeconds,
  getDailyCreditCounterKey,
  RENDER_CACHE_KEY_PREFIX,
  BROWSERACT_CREDIT_COUNTER_PREFIX,
  RENDER_CACHE_REDIS_DB,
  DEFAULT_CACHE_TTL_HOURS,
  getCachedRender,
  setCachedRender,
  incrementBrowseractCreditCounter,
  closeCacheRedis,
  __resetCacheRedisForTests,
} from "../utils/render-cache.js";
import type { ParsedPage } from "@seovista/geo-engine";

const REDIS_HOST = "127.0.0.1";
const REDIS_PORT = 56379;
const REDIS_URL = `redis://${REDIS_HOST}:${REDIS_PORT}/0`;

async function redisAvailable(): Promise<boolean> {
  const client = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true, maxRetriesPerRequest: 1 });
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

describe("render-cache pure helpers", () => {
  it("computeCacheKey produces geo:cache:{sha256(canonicalUrl)}", () => {
    const url = "https://example.com/";
    const expected = `${RENDER_CACHE_KEY_PREFIX}${createHash("sha256").update(url, "utf8").digest("hex")}`;
    expect(computeCacheKey(url)).toBe(expected);
    expect(computeCacheKey(url).startsWith(RENDER_CACHE_KEY_PREFIX)).toBe(true);
    expect(computeCacheKey(url).slice(RENDER_CACHE_KEY_PREFIX.length)).toHaveLength(64);
  });

  it("getDailyCreditCounterKey produces browseract:credits:consumed:{YYYY-MM-DD}", () => {
    const key = getDailyCreditCounterKey(new Date("2026-07-24T13:00:00Z"));
    expect(key.startsWith(BROWSERACT_CREDIT_COUNTER_PREFIX)).toBe(true);
    expect(key).toBe(`${BROWSERACT_CREDIT_COUNTER_PREFIX}2026-07-24`);
  });

  it("getCacheTtlSeconds defaults to 24h and respects BROWSERACT_CACHE_TTL_HOURS", () => {
    delete process.env.BROWSERACT_CACHE_TTL_HOURS;
    expect(getCacheTtlSeconds()).toBe(DEFAULT_CACHE_TTL_HOURS * 3600);
    process.env.BROWSERACT_CACHE_TTL_HOURS = "12";
    expect(getCacheTtlSeconds()).toBe(12 * 3600);
    process.env.BROWSERACT_CACHE_TTL_HOURS = "0";
    expect(getCacheTtlSeconds()).toBe(0);
    process.env.BROWSERACT_CACHE_TTL_HOURS = "not-a-number";
    expect(getCacheTtlSeconds()).toBe(0);
    delete process.env.BROWSERACT_CACHE_TTL_HOURS;
  });

  it("RENDER_CACHE_REDIS_DB is DB 1 (Phase A trust keys separated from BullMQ DB 0)", () => {
    expect(RENDER_CACHE_REDIS_DB).toBe(1);
  });
});

describe("render-cache Redis round-trip", () => {
  beforeEach(() => {
    __resetCacheRedisForTests();
    process.env.REDIS_URL = REDIS_URL;
    process.env.BROWSERACT_CACHE_TTL_HOURS = "24";
  });

  afterEach(async () => {
    await closeCacheRedis();
    __resetCacheRedisForTests();
    delete process.env.REDIS_URL;
    delete process.env.BROWSERACT_CACHE_TTL_HOURS;
  });

  it("writes and reads back a cached ParsedPage in Redis DB 1 with a TTL (VAL-A-SPA-001/003)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping round-trip test");
      return;
    }

    const url = `https://roundtrip.example.com/${Date.now()}`;
    const cacheKey = computeCacheKey(url);
    const page: ParsedPage = {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      title: "Roundtrip Title",
      metaRobots: { noindex: false, nofollow: false },
      headings: [{ level: 1, text: "Roundtrip" }],
      links: [],
      images: [],
      jsonLd: [],
      rawHtml: "<html><body><h1>Roundtrip</h1></body></html>",
      textContent: "Roundtrip",
    };

    // Clean slate.
    const probe = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true });
    try {
      await probe.connect();
      await probe.del(cacheKey);
    } finally {
      await probe.quit().catch(() => undefined);
    }

    try {
      await setCachedRender(cacheKey, page);
      const readBack = await getCachedRender(cacheKey);
      expect(readBack).not.toBeNull();
      expect(readBack?.title).toBe("Roundtrip Title");
      expect(readBack?.rawHtml).toContain("Roundtrip");

      // Verify the key lives in DB 1 with a positive TTL ≤ 24h.
      const verifier = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true });
      try {
        await verifier.connect();
        const ttl = await verifier.ttl(cacheKey);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(DEFAULT_CACHE_TTL_HOURS * 3600);
        // Key pattern check.
        const keys = await verifier.keys("geo:cache:*");
        expect(keys).toContain(cacheKey);
      } finally {
        await verifier.quit().catch(() => undefined);
      }
    } finally {
      const cleaner = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true });
      try {
        await cleaner.connect();
        await cleaner.del(cacheKey);
      } finally {
        await cleaner.quit().catch(() => undefined);
      }
    }
  });

  it("increments the daily credit counter in Redis DB 1 (VAL-A-SPA-001 evidence)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping counter test");
      return;
    }

    const counterKey = getDailyCreditCounterKey();
    const probe = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true });
    try {
      await probe.connect();
      const before = parseInt((await probe.get(counterKey)) ?? "0", 10);
      await incrementBrowseractCreditCounter();
      const after = parseInt((await probe.get(counterKey)) ?? "0", 10);
      expect(after).toBe(before + 1);
      // Counter lives in DB 1.
      const db1Check = new IORedis({ host: REDIS_HOST, port: REDIS_PORT, db: RENDER_CACHE_REDIS_DB, lazyConnect: true });
      try {
        await db1Check.connect();
        const val = await db1Check.get(counterKey);
        expect(val).not.toBeNull();
        expect(parseInt(val!, 10)).toBe(after);
      } finally {
        await db1Check.quit().catch(() => undefined);
      }
    } finally {
      await probe.quit().catch(() => undefined);
    }
  });
});
