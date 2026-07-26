import IORedis from "ioredis";

export interface CheckIpRateLimitInput {
  redisUrl: string;
  ip: string;
  limit?: number;
  windowSeconds?: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetSeconds: number;
}

const DEFAULT_RATE_LIMIT = 10;
const DEFAULT_WINDOW_SECONDS = 3600; // 1 hour

export async function checkIpRateLimit(
  input: CheckIpRateLimitInput
): Promise<RateLimitResult> {
  const {
    redisUrl,
    ip,
    limit = DEFAULT_RATE_LIMIT,
    windowSeconds = DEFAULT_WINDOW_SECONDS,
  } = input;

  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  const key = `geo:ratelimit:ip:${ip}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);

    const remaining = Math.max(0, limit - current);
    const success = current <= limit;

    return {
      success,
      remaining,
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  } catch (error) {
    console.error("Rate limiting Redis error:", error);
    // Fallback: allow request if Redis fails to avoid blocking legitimate traffic
    return {
      success: true,
      remaining: 1,
      resetSeconds: windowSeconds,
    };
  } finally {
    redis.disconnect();
  }
}
