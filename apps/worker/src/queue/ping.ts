import { Queue, Worker, type Job, type JobsOptions, type WorkerOptions } from "bullmq";
import type { DbClient } from "../db/client.js";
import { createJobRepository, createJobResultRepository } from "../db/job.js";
import { applyRetentionPolicy } from "./retention.js";

export interface PingJobData {
  correlationId: string;
  target: string;
  failOnce?: boolean;
}

export interface PingJobResult {
  correlationId: string;
  target: string;
  status: "ok";
  respondedAt: string;
}

export const PING_JOB_TYPE = "ping";
export const PING_RESULT_TYPE = "ping:result";

export interface PingQueueOptions {
  projectId: string;
  redisUrl: string;
  db: DbClient;
  queuePrefix?: string;
  attempts?: number;
  backoffDelayMs?: number;
  timeoutMs?: number;
}

export function createPingQueueName(projectId: string): string {
  return `${projectId}-ping`;
}

export function createPingJobId(correlationId: string): string {
  return `ping-${correlationId}`;
}

export function buildPingJobOptions(
  correlationId: string,
  options: Pick<PingQueueOptions, "attempts" | "backoffDelayMs" | "timeoutMs"> = {}
): JobsOptions {
  const attempts = options.attempts ?? 3;
  const backoffDelayMs = options.backoffDelayMs ?? 2000;

  return {
    jobId: createPingJobId(correlationId),
    attempts,
    backoff: {
      type: "exponential",
      delay: backoffDelayMs,
    },
    ...applyRetentionPolicy(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

export function createPingQueue(options: PingQueueOptions): Queue<PingJobData, PingJobResult> {
  const queueName = createPingQueueName(options.projectId);
  return new Queue<PingJobData, PingJobResult>(queueName, {
    connection: { url: options.redisUrl },
    ...(options.queuePrefix ? { prefix: options.queuePrefix } : {}),
    defaultJobOptions: {
      attempts: options.attempts ?? 3,
      backoff: {
        type: "exponential",
        delay: options.backoffDelayMs ?? 2000,
      },
      ...applyRetentionPolicy(),
    },
  });
}

export function createPingWorker(options: PingQueueOptions): Worker<PingJobData, PingJobResult> {
  const queueName = createPingQueueName(options.projectId);
  const jobs = createJobRepository(options.db);
  const results = createJobResultRepository(options.db);
  const timeoutMs = options.timeoutMs ?? 10000;

  const processor = async (job: Job<PingJobData>): Promise<PingJobResult> => {
    const { correlationId, target } = job.data;
    const jobIdentity = job.id ?? createPingJobId(correlationId);

    const existing = await jobs.findByIdentity(jobIdentity);

    if (existing?.status === "completed" && existing.result_id) {
      const prior = await results.findById(existing.result_id);
      return (prior?.payload as PingJobResult) ?? {
        correlationId,
        target,
        status: "ok",
        respondedAt: new Date().toISOString(),
      };
    }

    if (!existing) {
      await jobs.create({
        jobIdentity,
        queueName,
        correlationId,
        target,
        status: "running",
      });
    } else {
      await jobs.start(jobIdentity);
    }

    try {
      if (job.data.failOnce && job.attemptsMade <= 1) {
        throw new Error("injected first-attempt failure for retry test");
      }

      const resultPayload: PingJobResult = {
        correlationId,
        target,
        status: "ok",
        respondedAt: new Date().toISOString(),
      };

      const result = await withTimeout(
        results.create(correlationId, jobIdentity, PING_RESULT_TYPE, resultPayload),
        timeoutMs,
        "result-persistence"
      );
      await withTimeout(jobs.complete(jobIdentity, result.id), timeoutMs, "job-completion");

      return resultPayload;
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 3;
      const isRetryable = job.attemptsMade < maxAttempts;
      const status: "failed" | "permanent" = isRetryable ? "failed" : "permanent";
      const terminalClass: "retryable" | "permanent" = isRetryable ? "retryable" : "permanent";
      await jobs.markTerminal(jobIdentity, status, terminalClass).catch(() => {
        // swallow DB update failures to preserve the original error
      });
      throw error;
    }
  };

  const workerOptions: WorkerOptions = {
    connection: { url: options.redisUrl },
    ...(options.queuePrefix ? { prefix: options.queuePrefix } : {}),
    concurrency: 1,
    lockDuration: 30000,
  };

  return new Worker<PingJobData, PingJobResult>(queueName, processor, workerOptions);
}
