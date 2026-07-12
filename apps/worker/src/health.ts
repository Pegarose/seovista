import { createDbClient, checkDbConnection } from "./db/client.js";
import { createRedisConnection, checkRedisConnection } from "./queue/config.js";
import { getWorkerEnv, getProjectId } from "./env.js";

export type HealthStatus = "live" | "dead" | "ready" | "not_ready" | "unknown";

export interface DependencyHealth {
  name: string;
  status: "up" | "down" | "unknown";
  error?: string;
}

export interface HealthReport {
  name: string;
  liveness: "live" | "dead";
  readiness: "ready" | "not_ready";
  dependencies: DependencyHealth[];
  timestamp: string;
}

export interface WorkerHealthOptions {
  databaseUrl?: string;
  redisUrl?: string;
  projectId?: string;
}

export async function checkWorkerHealth(options?: WorkerHealthOptions): Promise<HealthReport> {
  const env = getWorkerEnv();
  const databaseUrl = options?.databaseUrl ?? env.DATABASE_URL;
  const redisUrl = options?.redisUrl ?? env.REDIS_URL;
  const projectId = options?.projectId ?? getProjectId(env);

  const dependencies: DependencyHealth[] = [];

  const dbClient = createDbClient({ connectionString: databaseUrl });
  let dbStatus: DependencyHealth;
  try {
    const up = await checkDbConnection(dbClient);
    dbStatus = { name: "postgres", status: up ? "up" : "down" };
  } catch (error) {
    dbStatus = {
      name: "postgres",
      status: "down",
      error: error instanceof Error ? error.name : "unknown",
    };
  } finally {
    await dbClient.close().catch(() => {
      // ignore close errors
    });
  }
  dependencies.push(dbStatus);

  const redis = createRedisConnection({ redisUrl });
  let redisStatus: DependencyHealth;
  try {
    await redis.connect();
    const up = await checkRedisConnection(redis);
    redisStatus = { name: "redis", status: up ? "up" : "down" };
  } catch (error) {
    redisStatus = {
      name: "redis",
      status: "down",
      error: error instanceof Error ? error.name : "unknown",
    };
  } finally {
    await redis.quit().catch(() => {
      // ignore quit errors
    });
  }
  dependencies.push(redisStatus);

  const allUp = dependencies.every((d) => d.status === "up");

  return {
    name: projectId,
    liveness: "live",
    readiness: allUp ? "ready" : "not_ready",
    dependencies,
    timestamp: new Date().toISOString(),
  };
}

export function isHealthReportReady(report: HealthReport): boolean {
  return report.readiness === "ready";
}
