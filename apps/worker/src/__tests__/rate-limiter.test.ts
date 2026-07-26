import { describe, it, expect, beforeEach, afterEach } from "vitest";
import IORedis from "ioredis";
import { checkIpRateLimit } from "../utils/rate-limiter.js";

describe("IP Rate Limiter", () => {
  let redis: IORedis;
  const testRedisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:56379";
  const testIp = "203.0.113.42";

  beforeEach(async () => {
    redis = new IORedis(testRedisUrl);
    await redis.del(`geo:ratelimit:ip:${testIp}`);
  });

  afterEach(async () => {
    await redis.del(`geo:ratelimit:ip:${testIp}`);
    redis.disconnect();
  });

  it("allows requests under the rate limit", async () => {
    const result = await checkIpRateLimit({
      redisUrl: testRedisUrl,
      ip: testIp,
      limit: 3,
    });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks requests exceeding the rate limit", async () => {
    const limit = 2;
    await checkIpRateLimit({ redisUrl: testRedisUrl, ip: testIp, limit });
    await checkIpRateLimit({ redisUrl: testRedisUrl, ip: testIp, limit });

    const blocked = await checkIpRateLimit({ redisUrl: testRedisUrl, ip: testIp, limit });

    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});
