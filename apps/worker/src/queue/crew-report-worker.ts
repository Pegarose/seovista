import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import {
  CrewAgencyError,
  resolveCrewAgencyClient,
  type CrewAgencyClient,
  type CrewJobStatus,
} from "../utils/crew-agency-client.js";
import {
  TOOL_QUEUE_NAMES,
  buildCrewReportRequest,
  buildCrewReportResultPayload,
  type CrewReportTool,
} from "../processors/crew-report.js";
import {
  CREW_REPORT_JOB_RECORD_QUEUE_NAME,
  CREW_REPORT_QUEUE_NAME,
} from "./crew-report-submission.js";

// Helper to parse redis url for bullmq (same shape as keyword-rank-worker.ts)
function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) {
    return { host: "127.0.0.1", port: 8637 };
  }

  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port, 10) || 8637
    };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

/** Poll interval between CrewAgency job status checks (5 s). */
const POLL_INTERVAL_MS = 5_000;

/** Hard ceiling for the internal CrewAgency poll loop (10 min). */
const POLL_CEILING_MS = 10 * 60 * 1_000;

export interface CrewReportWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `CREW_REPORT_QUEUE_NAME` env → the default
   * `"crew_report_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to CREW_REPORT_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
  /**
   * Sleep used between CrewAgency poll iterations. Injected so tests can run
   * the poll loop with a fake instead of waiting out real 5 s intervals.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Injected CrewAgency client override (tests pass a mock). When absent the
   * worker resolves the client from `CREW_AGENCY_API_URL` /
   * `CREW_AGENCY_API_KEY`; a missing configuration maps to a permanent
   * `crew.misconfigured` failure.
   */
  client?: CrewAgencyClient;
}

export function getCrewReportWorkerConcurrency(options?: CrewReportWorkerOptions, env = process.env): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.CREW_REPORT_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

export interface CrewReportDb {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: readonly Record<string, unknown>[] }>;
}

export interface CrewReportJobDeps {
  db: CrewReportDb;
  client: CrewAgencyClient | null;
  sleep: (ms: number) => Promise<void>;
  /** Poll ceiling override; defaults to the module POLL_CEILING_MS (10 min). */
  pollCeilingMs?: number;
  /** Poll interval override; defaults to the module POLL_INTERVAL_MS (5 s). */
  pollIntervalMs?: number;
}

/**
 * Resolves the configured CrewAgency client for the worker wiring. Invalid
 * operator configuration is normalized to null so the handler's single
 * terminal-status mapping path records crew.misconfigured as permanent.
 */
export function resolveCrewReportClient(
  env: { CREW_AGENCY_API_URL?: string | undefined; CREW_AGENCY_API_KEY?: string | undefined } = process.env,
): CrewAgencyClient | null {
  try {
    return resolveCrewAgencyClient(env);
  } catch (err) {
    if (err instanceof CrewAgencyError && err.code === "crew.misconfigured") {
      return null;
    }
    throw err;
  }
}

/**
 * Pure job-processing logic extracted from the BullMQ Worker callback so it
 * can be unit-tested with a fake db, mock client, and instant sleep. The
 * terminal-status mapping (catch block) lives here so every error path is
 * testable. `startCrewReportWorker` is thin wiring that resolves deps from
 * env/options and delegates here.
 */
export async function processCrewReportJob(
  data: { jobId: string; sourceJobId: string; tool: CrewReportTool },
  deps: CrewReportJobDeps,
): Promise<void> {
  const { jobId, sourceJobId, tool } = data;
  const { db, client, sleep } = deps;
  const pollCeilingMs = deps.pollCeilingMs ?? POLL_CEILING_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;

  try {
    await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

    // Fail closed when CrewAgency is not configured: a null client maps to a
    // permanent 'crew.misconfigured' failure (no retry can fix configuration).
    if (!client) {
      throw new CrewAgencyError(
        "crew.misconfigured",
        "CrewAgency is not configured: CREW_AGENCY_API_URL and CREW_AGENCY_API_KEY must both be set",
      );
    }

    const sourceQueueName = TOOL_QUEUE_NAMES[tool];
    if (!sourceQueueName) {
      throw permanentCrewReportError(
        `Unknown crew report tool '${String(tool)}' on job ${jobId}`,
      );
    }

    const sourceRes = await db.query(
      `SELECT r.payload, j.target AS source_target FROM job_records j JOIN job_results r ON r.correlation_id = j.correlation_id WHERE j.id = $1 AND j.queue_name = $2 ORDER BY r.created_at DESC LIMIT 1`,
      [sourceJobId, sourceQueueName]
    );
    const sourceRow = sourceRes.rows[0];
    if (!sourceRow) {
      throw permanentCrewReportError(
        `Source payload not found for crew report job ${jobId}: no ${sourceQueueName} result for source job ${sourceJobId}`,
      );
    }

    const request = buildCrewReportRequest({
      tool,
      sourcePayload: sourceRow.payload,
      sourceTarget:
        typeof sourceRow.source_target === "string" ? sourceRow.source_target : undefined,
    });
    const { jobId: crewJobId } = await client.kickoff(request.endpoint, request.body);

    const crewStatus = await pollCrewJobUntilTerminal(client, crewJobId, sleep, pollCeilingMs, pollIntervalMs);

    if (crewStatus.status === "failed") {
      throw new Error(
        `CrewAgency job ${crewJobId} failed: ${crewStatus.error ?? "no error detail returned"}`,
      );
    }

    const reportMarkdown = extractReportMarkdown(crewStatus.result);
    if (!reportMarkdown) {
      throw new CrewAgencyError(
        "crew.unavailable",
        `CrewAgency job ${crewJobId} completed without markdown report content`,
      );
    }

    const result = buildCrewReportResultPayload({
      sourceJobId,
      tool,
      endpoint: request.endpoint,
      reportMarkdown,
      crewJobId,
    });

    const jobRecordRes = await db.query(
      `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
      [jobId, CREW_REPORT_JOB_RECORD_QUEUE_NAME]
    );
    const rawJobRecord = jobRecordRes.rows[0];
    if (!rawJobRecord) {
      throw new Error(`Job record ${jobId} not found during result saving.`);
    }
    const { job_identity, correlation_id } = rawJobRecord;

    const jobResultRes = await db.query(
      `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
       VALUES ($1, $2, 'crew-report:result', $3) RETURNING id`,
      [correlation_id, job_identity, JSON.stringify(result)]
    );
    const rawResultRes = jobResultRes.rows[0];
    if (!rawResultRes) {
      throw new Error(`Failed to return result ID after crew report job save.`);
    }

    const resultId = rawResultRes.id;

    await db.query(
      `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
      [jobId, resultId]
    );
  } catch (err) {
    console.error("Crew report worker failed job:", err);
    let terminalStatus = 'failed';

    if (err instanceof CrewAgencyError) {
      if (
        err.code === "crew.auth" ||
        err.code === "crew.misconfigured" ||
        err.code === "crew.client_error"
      ) {
        terminalStatus = 'permanent';
      } else {
        terminalStatus = 'timeout';
      }
    } else if (typeof err === 'object' && err !== null && 'code' in err) {
      const code = err.code;
      if (typeof code === 'string' && code.startsWith('validation.')) {
        terminalStatus = 'permanent';
      }
    }

    await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
    throw err;
  }
}

export function startCrewReportWorker(options?: CrewReportWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start crew report worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.CREW_REPORT_QUEUE_NAME ?? CREW_REPORT_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, sourceJobId, tool } = job.data as {
        jobId: string;
        sourceJobId: string;
        tool: CrewReportTool;
      };

      const client = options?.client ?? resolveCrewReportClient();
      const sleep = options?.sleep ?? defaultSleep;
      await processCrewReportJob(
        { jobId, sourceJobId, tool },
        { db, client, sleep },
      );
    },
    { connection, autorun: true, concurrency: getCrewReportWorkerConcurrency(options) }
  );

  // Close db client when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
  });

  return worker;
}

/**
 * Polls a CrewAgency job every `POLL_INTERVAL_MS` until it reaches a terminal
 * status (`completed`/`failed`). Unknown status strings are treated as
 * in-flight (the client passes them through verbatim). Hitting the
 * `POLL_CEILING_MS` ceiling throws `crew.timeout` so the job maps to the
 * retryable 'timeout' terminal status instead of hanging forever.
 */
async function pollCrewJobUntilTerminal(
  client: CrewAgencyClient,
  crewJobId: string,
  sleep: (ms: number) => Promise<void>,
  pollCeilingMs: number = POLL_CEILING_MS,
  pollIntervalMs: number = POLL_INTERVAL_MS,
): Promise<CrewJobStatus> {
  const startedAt = Date.now();
  for (;;) {
    const status = await client.getJob(crewJobId);
    if (status.status === "completed" || status.status === "failed") {
      return status;
    }
    if (Date.now() - startedAt >= pollCeilingMs) {
      throw new CrewAgencyError(
        "crew.timeout",
        `CrewAgency job ${crewJobId} did not reach a terminal state within ${pollCeilingMs}ms`,
      );
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * Extracts the markdown report body from a completed CrewAgency job result.
 * Accepts a plain string result or a record carrying the report under
 * `markdown` / `reportMarkdown` / `report`.
 */
function extractReportMarkdown(result: unknown): string | null {
  if (typeof result === "string" && result.trim().length > 0) {
    return result;
  }
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    for (const key of ["markdown", "reportMarkdown", "report"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }
  return null;
}

/**
 * Builds an input-side permanent failure with the `validation.*` code
 * convention the sibling workers use so the catch block maps it to
 * 'permanent' instead of 'failed'.
 */
function permanentCrewReportError(message: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = "validation.crew_report";
  return error;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
