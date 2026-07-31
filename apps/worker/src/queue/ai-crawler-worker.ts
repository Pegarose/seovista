import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { fetchTextSafely } from "../utils/fetcher.js";
import { processAiCrawlerAuditPayload } from "../processors/ai-crawler-audit.js";
import { AI_CRAWLER_JOB_RECORD_QUEUE_NAME, AI_CRAWLER_QUEUE_NAME } from "./ai-crawler-submission.js";

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

export interface AiCrawlerWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `AI_CRAWLER_QUEUE_NAME` env → the default
   * `"ai_crawler_audit_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to AI_CRAWLER_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
}

export function getAiCrawlerWorkerConcurrency(options?: AiCrawlerWorkerOptions, env = process.env): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.AI_CRAWLER_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

export function startAiCrawlerWorker(options?: AiCrawlerWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start ai crawler worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.AI_CRAWLER_QUEUE_NAME ?? AI_CRAWLER_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, url } = job.data;

      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Fetch robots.txt through the hardened fetcher (DNS resolution +
        // ipaddr.js range checks blocking loopback/link-local/private),
        // never raw fetch. HTTP 404 means "no robots.txt" — a valid audit
        // outcome scored by the processor with a null document. Any other
        // non-2xx response is an honest fetch failure and fails the job.
        const robotsUrl = new URL("/robots.txt", url).toString();
        const fetched = await fetchTextSafely(robotsUrl);
        if (fetched.statusCode !== 404 && (fetched.statusCode < 200 || fetched.statusCode >= 300)) {
          throw new Error(`robots.txt fetch failed: HTTP ${fetched.statusCode} from ${robotsUrl}`);
        }

        const result = processAiCrawlerAuditPayload(
          fetched.statusCode === 404 ? null : fetched.body,
          robotsUrl,
        );

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, AI_CRAWLER_JOB_RECORD_QUEUE_NAME]
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'ai-crawler:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)]
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after ai crawler job save.`);
        }

        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId]
        );
      } catch (err) {
        console.error("AI crawler worker failed job:", err);
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
    { connection, autorun: true, concurrency: getAiCrawlerWorkerConcurrency(options) }
  );

  // Close db client when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
  });

  return worker;
}
