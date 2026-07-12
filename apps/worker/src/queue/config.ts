import IORedis from "ioredis";

export interface QueueConnectionOptions {
  redisUrl: string;
  maxRetriesPerRequest?: number | null;
}

export function createRedisConnection(options: QueueConnectionOptions): IORedis {
  return new IORedis(options.redisUrl, {
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
    lazyConnect: true,
  });
}

export async function checkRedisConnection(redis: IORedis): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
