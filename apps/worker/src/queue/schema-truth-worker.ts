import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { fetchAndParseUrl } from "../utils/fetcher.js";
import { processSchemaTruthPayload } from "../processors/schema-truth.js";
import {
  SCHEMA_TRUTH_JOB_RECORD_QUEUE_NAME,
  SCHEMA_TRUTH_QUEUE_NAME,
} from "./schema-truth-submission.js";

// Helper to parse redis url for bullmq (same shape as the sibling workers)
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

export interface SchemaTruthWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `SCHEMA_TRUTH_QUEUE_NAME` env → the default
   * `"schema_truth_audit_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers cannot steal jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to SCHEMA_TRUTH_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
}

export function getSchemaTruthWorkerConcurrency(
  options?: SchemaTruthWorkerOptions,
  env = process.env,
): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.SCHEMA_TRUTH_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

export function startSchemaTruthWorker(options?: SchemaTruthWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start schema truth worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.SCHEMA_TRUTH_QUEUE_NAME ?? SCHEMA_TRUTH_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, url } = job.data as { jobId: string; url: string };

      try {
        await db.query(
          `UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`,
          [jobId],
        );

        // Reuse the hardened fetcher — every hop is re-validated for SSRF
        // and the Broseract/Cheerio render-cache contract holds here too.
        const parsedPage = await fetchAndParseUrl(url);
        const result = processSchemaTruthPayload(parsedPage.rawHtml, parsedPage.textContent);

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, SCHEMA_TRUTH_JOB_RECORD_QUEUE_NAME],
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Schema truth job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'schema-truth:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)],
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after schema truth job save.`);
        }

        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId],
        );
      } catch (err) {
        console.error("Schema truth worker failed job:", err);
        // Same retriable-vs-permanent mapping heuristic as the schema worker —
        // provider timeouts map to 'timeout', validation/SSRF and other
        // permanent input errors map to 'permanent', everything else is
        // 'failed'.
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
    { connection, autorun: true, concurrency: getSchemaTruthWorkerConcurrency(options) },
  );

  // Close db client when worker closes to avoid hanging connection
  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
