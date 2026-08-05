import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { fetchWithValidatedRedirects } from "../utils/fetcher.js";
import { processRenderParityPayload } from "../processors/render-parity.js";
import { CRAWLER_UA, DEFAULT_BROWSER_UA } from "@seovista/seo-core";
import {
  RENDER_PARITY_JOB_RECORD_QUEUE_NAME,
  RENDER_PARITY_QUEUE_NAME,
} from "./render-parity-submission.js";

// Helper to parse redis url for bullmq (same shape as sibling workers)
function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) {
    return { host: "127.0.0.1", port: 8637 };
  }
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || "127.0.0.1",
      port: parseInt(url.port, 10) || 8637,
    };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

export interface RenderParityWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order mirrors the sibling
   * workers so a consistent env keeps producer/consumer on the same queue.
   */
  queueName?: string;
  /** Override BullMQ concurrency limit. Defaults to RENDER_PARITY_WORKER_CONCURRENCY env or 2 (two fetches per job). */
  concurrency?: number;
}

export function getRenderParityWorkerConcurrency(
  options?: RenderParityWorkerOptions,
  env = process.env,
): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.RENDER_PARITY_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 2;
}

/** Body cap for both fetches (2 MiB per side, smaller than geo because we only need the soup). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function startRenderParityWorker(options?: RenderParityWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start render parity worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.RENDER_PARITY_QUEUE_NAME ?? RENDER_PARITY_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, url } = job.data as { jobId: string; url: string };

      try {
        await db.query(
          `UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`,
          [jobId],
        );

        // Two SSRF-guarded fetches with distinct User-Agents — the browser
        // flavour simulates what a user sees, the crawler flavour simulates
        // what a search/AI crawler sees. Both go through
        // fetchWithValidatedRedirects so every redirect hop is re-validated.
        const defaultResp = await fetchWithValidatedRedirects(url, {
          maxBodyBytes: MAX_BODY_BYTES,
          headers: { "User-Agent": DEFAULT_BROWSER_UA },
        });
        const crawlerResp = await fetchWithValidatedRedirects(url, {
          maxBodyBytes: MAX_BODY_BYTES,
          headers: { "User-Agent": CRAWLER_UA },
        });

        const result = processRenderParityPayload(defaultResp.body, crawlerResp.body, {
          default: { url: defaultResp.finalUrl, status: defaultResp.status },
          crawler: { url: crawlerResp.finalUrl, status: crawlerResp.status },
        });

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, RENDER_PARITY_JOB_RECORD_QUEUE_NAME],
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Render parity job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'render-parity:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)],
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after render parity job save.`);
        }
        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId],
        );
      } catch (err) {
        console.error("Render parity worker failed job:", err);
        // Same retriable-vs-permanent heuristic as the sibling workers.
        const errorMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
        let terminalStatus = "failed";
        if (typeof err === "object" && err !== null && "code" in err && typeof (err as { code: unknown }).code === "string") {
          const code = (err as { code: string }).code;
          if (code.startsWith("provider.timeout") || code.startsWith("provider.unavailable") || code.startsWith("provider.rate_limited")) {
            terminalStatus = "timeout";
          } else if (code.startsWith("validation.") || code.startsWith("ownership.") || code.startsWith("auth.") || code.startsWith("conflict.")) {
            terminalStatus = "permanent";
          } else {
            terminalStatus = (err as { retryable?: boolean }).retryable ? "timeout" : "failed";
          }
        } else {
          if (errorMsg.includes("timeout") || errorMsg.includes("socket hang up") || errorMsg.includes("rate limit") || errorMsg.includes("unavailable")) {
            terminalStatus = "timeout";
          } else if (errorMsg.includes("validation") || errorMsg.includes("ownership") || errorMsg.includes("malformed") || errorMsg.includes("auth") || errorMsg.includes("ssrf")) {
            terminalStatus = "permanent";
          }
        }
        await db.query(
          `UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`,
          [jobId, terminalStatus],
        );
        throw err;
      }
    },
    { connection, autorun: true, concurrency: getRenderParityWorkerConcurrency(options) },
  );

  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
