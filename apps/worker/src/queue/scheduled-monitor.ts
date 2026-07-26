import { Queue, ConnectionOptions } from "bullmq";

export interface ScheduledAuditPayload {
  url: string;
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  tenantId: string;
  siteId?: string;
  lastAuditedAt?: string;
}

export function processScheduledAuditCheck(payload: ScheduledAuditPayload): boolean {
  if (!payload.lastAuditedAt) {
    return true;
  }

  const lastAudit = new Date(payload.lastAuditedAt).getTime();
  const now = Date.now();
  const diffMs = now - lastAudit;

  const FREQUENCY_THRESHOLDS_MS: Record<ScheduledAuditPayload["frequency"], number> = {
    hourly: 3600000,
    daily: 86400000,
    weekly: 604800000,
    monthly: 2592000000,
  };

  const threshold = FREQUENCY_THRESHOLDS_MS[payload.frequency] ?? 86400000;
  return diffMs >= threshold;
}

export interface EnqueueScheduledResult {
  jobId?: string;
  enqueued: boolean;
}

export async function enqueueScheduledAudit(
  queue: { add: (name: string, data: any, opts?: any) => Promise<{ id?: string }> },
  payload: ScheduledAuditPayload
): Promise<EnqueueScheduledResult> {
  const isDue = processScheduledAuditCheck(payload);
  if (!isDue) {
    return { enqueued: false };
  }

  const job = await queue.add(
    "scheduled-recrawl",
    {
      url: payload.url,
      tenantId: payload.tenantId,
      siteId: payload.siteId,
      forceAudit: false,
      isRecrawl: true,
    },
    {
      jobId: `recrawl-${payload.tenantId}-${Buffer.from(payload.url).toString("hex").slice(0, 16)}`,
    }
  );

  return job.id ? { jobId: job.id, enqueued: true } : { enqueued: true };
}

export const SCHEDULED_QUEUE_NAME = "geo-scheduled-monitoring";

export function createScheduledMonitorQueue(connection: ConnectionOptions): Queue<ScheduledAuditPayload> {
  return new Queue<ScheduledAuditPayload>(SCHEDULED_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 604800, count: 500 },
    },
  });
}
