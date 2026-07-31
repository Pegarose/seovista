import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { fetchAndParseUrl } from "../utils/fetcher.js";
import { processSchemaAuditJobPayload } from "../processors/schema-audit.js";
import { SCHEMA_JOB_RECORD_QUEUE_NAME, SCHEMA_QUEUE_NAME } from "./schema-submission.js";

// Helper to parse redis url for bullmq (same shape as geo-worker.ts)
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

export interface SchemaWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `SCHEMA_QUEUE_NAME` env → the default
   * `"schema_audit_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to SCHEMA_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
}

export function getSchemaWorkerConcurrency(options?: SchemaWorkerOptions, env = process.env): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.SCHEMA_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

export function startSchemaWorker(options?: SchemaWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start schema worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.SCHEMA_QUEUE_NAME ?? SCHEMA_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, url } = job.data;

      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Fetch through the hardened fetcher (DNS resolution + ipaddr.js range
        // checks blocking loopback/link-local/private), never raw fetch. The
        // parsed page carries the raw HTML the schema extractor consumes.
        const parsedPage = await fetchAndParseUrl(url);

        const result = await processSchemaAuditJobPayload(parsedPage.rawHtml);

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, SCHEMA_JOB_RECORD_QUEUE_NAME]
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'schema:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)]
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after schema job save.`);
        }

        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId]
        );
      } catch (err) {
        console.error("Schema worker failed job:", err);
        // Same retriable-vs-permanent mapping heuristic as the geo worker:
        // provider timeouts/rate limits map to 'timeout', validation/SSRF and
        // other permanent input errors map to 'permanent', everything else is
        // 'failed'.
        const errorMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

        let terminalStatus = 'failed';

        if (typeof err === 'object' && err !== null && 'code' in err && typeof (err as any).code === 'string') {
          const code = (err as any).code as string;
          if (code.startsWith('provider.timeout') || code.startsWith('provider.unavailable') || code.startsWith('provider.rate_limited')) {
            terminalStatus = 'timeout';
          } else if (code.startsWith('validation.') || code.startsWith('ownership.') || code.startsWith('auth.') || code.startsWith('conflict.')) {
            terminalStatus = 'permanent';
          } else {
            terminalStatus = (err as any).retryable ? 'timeout' : 'failed';
          }
        } else {
          // Fallback heuristic matching for errors that bypassed the domain boundaries
          if (errorMsg.includes('timeout') || errorMsg.includes('socket hang up') || errorMsg.includes('rate limit') || errorMsg.includes('unavailable')) {
            terminalStatus = 'timeout';
          } else if (errorMsg.includes('validation') || errorMsg.includes('ownership') || errorMsg.includes('malformed') || errorMsg.includes('auth') || errorMsg.includes('ssrf')) {
            terminalStatus = 'permanent';
          }
        }

        await db.query(`UPDATE job_records SET status = $2, updated_at = now() WHERE id = $1`, [jobId, terminalStatus]);
        throw err;
      }
    },
    { connection, autorun: true, concurrency: getSchemaWorkerConcurrency(options) }
  );

  // Close db client when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
  });

  return worker;
}
