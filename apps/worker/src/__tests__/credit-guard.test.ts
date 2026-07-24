import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import nodeConsole from "node:console";
import IORedis from "ioredis";
import {
  getDailyCreditLimit,
  getDailyCreditConsumed,
  getDailyCreditCounterKey,
  closeCacheRedis,
  __resetCacheRedisForTests,
  RENDER_CACHE_REDIS_DB,
  DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT,
} from "../utils/render-cache.js";
import {
  getDailyCreditStatus,
  isDailyCreditExhausted,
  logDailyCreditBudgetOnBoot,
} from "../utils/credit-guard.js";

const REDIS_HOST = "127.0.0.1";
const REDIS_PORT = 56379;
const REDIS_URL = `redis://${REDIS_HOST}:${REDIS_PORT}/0`;

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

describe("credit-guard env parsing", () => {
  beforeEach(() => {
    delete process.env.BROWSERACT_DAILY_CREDIT_LIMIT;
  });

  it("defaults to 4000 when BROWSERACT_DAILY_CREDIT_LIMIT is unset", () => {
    expect(getDailyCreditLimit()).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
    expect(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT).toBe(4000);
  });

  it("parses a positive integer env var", () => {
    process.env.BROWSERACT_DAILY_CREDIT_LIMIT = "1500";
    expect(getDailyCreditLimit()).toBe(1500);
  });

  it("falls back to default on non-numeric / negative / non-finite values", () => {
    process.env.BROWSERACT_DAILY_CREDIT_LIMIT = "not-a-number";
    expect(getDailyCreditLimit()).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
    process.env.BROWSERACT_DAILY_CREDIT_LIMIT = "-5";
    expect(getDailyCreditLimit()).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
    process.env.BROWSERACT_DAILY_CREDIT_LIMIT = "NaN";
    expect(getDailyCreditLimit()).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
  });

  it("treats empty string as unset (default)", () => {
    process.env.BROWSERACT_DAILY_CREDIT_LIMIT = "   ";
    expect(getDailyCreditLimit()).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
  });
});

describe("credit-guard status (Redis unavailable degrades to under-limit)", () => {
  beforeEach(() => {
    __resetCacheRedisForTests();
    delete process.env.REDIS_URL;
    delete process.env.BROWSERACT_DAILY_CREDIT_LIMIT;
  });

  afterEach(async () => {
    await closeCacheRedis();
    __resetCacheRedisForTests();
  });

  it("reports consumed=0 and exhausted=false when Redis is not configured", async () => {
    const status = await getDailyCreditStatus();
    expect(status.consumed).toBe(0);
    expect(status.limit).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
    expect(status.remaining).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
    expect(status.exhausted).toBe(false);
    expect(await isDailyCreditExhausted()).toBe(false);
  });

  it("boot log emits the exact 'Browseract credits remaining today: {N}' line with non-negative N (VAL-A-MIT-004)", async () => {
    const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => {});
    try {
      const status = await logDailyCreditBudgetOnBoot();
      expect(status.remaining).toBeGreaterThanOrEqual(0);

      // Find the boot-budget JSON line among console.log calls.
      const bootLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes("Browseract credits remaining today:"));
      expect(bootLine).toBeDefined();
      expect(bootLine!).toContain(
        `Browseract credits remaining today: ${status.remaining}`,
      );
      // Structured fields present.
      expect(bootLine!).toContain('"event":"boot_budget"');
      expect(bootLine!).toContain('"layer":"credit-guard"');
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("credit-guard Redis round-trip (VAL-A-MIT-003 / VAL-A-MIT-004)", () => {
  beforeEach(() => {
    __resetCacheRedisForTests();
    process.env.REDIS_URL = REDIS_URL;
    delete process.env.BROWSERACT_DAILY_CREDIT_LIMIT;
  });

  afterEach(async () => {
    await closeCacheRedis();
    __resetCacheRedisForTests();
    delete process.env.REDIS_URL;
  });

  it("reads the daily counter from Redis DB 1 and reports exhaustion at the limit", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping round-trip test");
      return;
    }

    const counterKey = getDailyCreditCounterKey();
    const probe = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      db: RENDER_CACHE_REDIS_DB,
      lazyConnect: true,
    });
    try {
      await probe.connect();
      // Seed the counter to the default limit so the guard fires.
      await probe.set(counterKey, String(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT));

      const consumed = await getDailyCreditConsumed();
      expect(consumed).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);

      const status = await getDailyCreditStatus();
      expect(status.consumed).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
      expect(status.limit).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT);
      expect(status.remaining).toBe(0);
      expect(status.exhausted).toBe(true);
      expect(await isDailyCreditExhausted()).toBe(true);
    } finally {
      // Clean up the seeded counter so other tests start fresh.
      try {
        await probe.del(counterKey);
      } catch {
        // best-effort
      }
      await probe.quit().catch(() => undefined);
    }
  });

  it("boot log reflects the remaining budget from Redis DB 1 (VAL-A-MIT-004)", async () => {
    if (!(await redisAvailable())) {
      console.warn("Redis not available on 56379 — skipping boot-budget test");
      return;
    }

    const counterKey = getDailyCreditCounterKey();
    const probe = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      db: RENDER_CACHE_REDIS_DB,
      lazyConnect: true,
    });
    try {
      await probe.connect();
      // Seed 100 credits consumed; remaining should be 4000 - 100 = 3900.
      await probe.set(counterKey, "100");

      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => {});
      try {
        const status = await logDailyCreditBudgetOnBoot();
        expect(status.consumed).toBe(100);
        expect(status.remaining).toBe(DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT - 100);

        const bootLine = logSpy.mock.calls
          .map((args) => String(args[0]))
          .find((line) => line.includes("Browseract credits remaining today:"));
        expect(bootLine).toBeDefined();
        expect(bootLine!).toContain(
          `Browseract credits remaining today: ${DEFAULT_BROWSERACT_DAILY_CREDIT_LIMIT - 100}`,
        );
      } finally {
        logSpy.mockRestore();
      }
    } finally {
      try {
        await probe.del(counterKey);
      } catch {
        // best-effort
      }
      await probe.quit().catch(() => undefined);
    }
  });
});
