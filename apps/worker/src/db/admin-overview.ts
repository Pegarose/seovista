import { checkDbConnection, type DbClient } from "./client.js";
import { checkRedisConnection, createRedisConnection } from "../queue/config.js";

export type OverviewDependencyStatus = "available" | "unavailable";

export interface AdminOverview {
  activeAdminUsers: number;
  jobCounts: Record<string, number>;
  auditEventsToday: number;
  apiCostToday: string;
  dependencies: Array<{ name: string; status: OverviewDependencyStatus }>;
  recentActivity: Array<{
    action: string;
    actorIdentity: string;
    outcome: string;
    recordedAt: Date;
  }>;
}

async function checkRedisAvailability(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return false;

  const redis = createRedisConnection({ redisUrl });
  try {
    await redis.connect();
    return await checkRedisConnection(redis);
  } catch {
    return false;
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

export async function readAdminOverview(client: DbClient, now = new Date()): Promise<AdminOverview> {
  const [users, jobs, audit, costs, recent, postgresAvailable, redisAvailable] = await Promise.all([
    client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM admin_users WHERE status = 'active'").catch(() => ({ rows: [] })),
    client.query<{ status: string; count: number }>(
      "SELECT status, COUNT(*)::int AS count FROM job_records GROUP BY status ORDER BY status",
    ).catch(() => ({ rows: [] })),
    client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM audit_logs WHERE recorded_at >= date_trunc('day', $1::timestamptz)",
      [now],
    ).catch(() => ({ rows: [] })),
    client.query<{ amount: string }>(
      "SELECT COALESCE(SUM(amount), 0)::text AS amount FROM api_cost_ledger WHERE recorded_at >= date_trunc('day', $1::timestamptz)",
      [now],
    ).catch(() => ({ rows: [] })),
    client.query<{ action: string; actor_identity: string; outcome: string; recorded_at: Date }>(
      `
        SELECT action, actor_identity, outcome, recorded_at
        FROM audit_logs
        ORDER BY recorded_at DESC
        LIMIT 8
      `,
    ).catch(() => ({ rows: [] })),
    checkDbConnection(client),
    checkRedisAvailability(),
  ]);

  const jobCounts = Object.fromEntries(jobs.rows.map((row) => [row.status, row.count]));
  return {
    activeAdminUsers: users.rows[0]?.count ?? 0,
    jobCounts,
    auditEventsToday: audit.rows[0]?.count ?? 0,
    apiCostToday: costs.rows[0]?.amount ?? "0",
    dependencies: [
      { name: "PostgreSQL", status: postgresAvailable ? "available" : "unavailable" },
      { name: "Redis", status: redisAvailable ? "available" : "unavailable" },
    ],
    recentActivity: recent.rows.map((row) => ({
      action: row.action,
      actorIdentity: row.actor_identity,
      outcome: row.outcome,
      recordedAt: row.recorded_at,
    })),
  };
}
