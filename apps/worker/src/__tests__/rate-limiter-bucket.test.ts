import { describe, expect, it, vi, beforeEach } from "vitest";

const redisState = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class {
    constructor(_url: string, _options?: unknown) {
      // no-op: the mocked client holds no connection
    }
    incr(key: string) {
      return redisState.incr(key);
    }
    expire(key: string, seconds: number) {
      return redisState.expire(key, seconds);
    }
    ttl(key: string) {
      return redisState.ttl(key);
    }
    disconnect() {
      return redisState.disconnect();
    }
  },
}));

import { checkIpRateLimit } from "../utils/rate-limiter.js";

const REDIS_URL = "redis://127.0.0.1:8637";
const IP = "203.0.113.77";

describe("checkIpRateLimit bucket namespacing", () => {
  beforeEach(() => {
    redisState.incr.mockReset().mockResolvedValue(1);
    redisState.expire.mockReset().mockResolvedValue(1);
    redisState.ttl.mockReset().mockResolvedValue(3600);
    redisState.disconnect.mockReset();
  });

  it("uses the legacy key shape when no bucket is given (backwards compatible)", async () => {
    const result = await checkIpRateLimit({ redisUrl: REDIS_URL, ip: IP, limit: 5 });

    expect(result.success).toBe(true);
    expect(redisState.incr).toHaveBeenCalledTimes(1);
    expect(redisState.incr).toHaveBeenCalledWith(`geo:ratelimit:ip:${IP}`);
  });

  it("namespaces the Redis key with the bucket when one is provided", async () => {
    const result = await checkIpRateLimit({
      redisUrl: REDIS_URL,
      ip: IP,
      limit: 5,
      bucket: "crew-report",
    });

    expect(result.success).toBe(true);
    expect(redisState.incr).toHaveBeenCalledTimes(1);
    expect(redisState.incr).toHaveBeenCalledWith(`geo:ratelimit:ip:crew-report:${IP}`);
  });

  it("keeps bucketed and unbucketed counters on distinct keys", async () => {
    await checkIpRateLimit({ redisUrl: REDIS_URL, ip: IP, limit: 5 });
    await checkIpRateLimit({ redisUrl: REDIS_URL, ip: IP, limit: 5, bucket: "crew-report" });

    const keys = redisState.incr.mock.calls.map((call) => call[0]);
    expect(keys).toEqual([
      `geo:ratelimit:ip:${IP}`,
      `geo:ratelimit:ip:crew-report:${IP}`,
    ]);
    expect(new Set(keys).size).toBe(2);
  });
});
