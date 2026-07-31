import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { resolveSerpProvider } from "../utils/serp-provider.js";
import { processKeywordRankPayload } from "../processors/keyword-rank.js";
import {
  KEYWORD_RANK_JOB_RECORD_QUEUE_NAME,
  KEYWORD_RANK_QUEUE_NAME,
} from "./keyword-rank-submission.js";
import type { SerpLocale } from "@seovista/seo-core";

// Helper to parse redis url for bullmq (same shape as schema-worker.ts)
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

export interface KeywordRankWorkerOptions {
  /**
   * Override the BullMQ queue name. Resolution order:
   * `options.queueName` → `KEYWORD_RANK_QUEUE_NAME` env → the default
   * `"keyword_rank_jobs"` — the same env the submission side reads, so
   * setting it on both sides keeps producer and consumer on the same queue.
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to KEYWORD_RANK_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
}

export function getKeywordRankWorkerConcurrency(options?: KeywordRankWorkerOptions, env = process.env): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.KEYWORD_RANK_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

export function startKeywordRankWorker(options?: KeywordRankWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start keyword rank worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.KEYWORD_RANK_QUEUE_NAME ?? KEYWORD_RANK_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, domain, keyword, locale } = job.data as {
        jobId: string;
        domain: string;
        keyword: string;
        locale: SerpLocale;
      };

      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Operator-configured SearXNG endpoint when SEARXNG_BASE_URL is set,
        // deterministic mock otherwise (Sprint 0 mock-era posture).
        const provider = resolveSerpProvider();
        const entries = await provider.search(keyword, locale, domain);

        const result = processKeywordRankPayload({
          domain,
          keyword,
          locale,
          entries,
          dataSource: provider.source,
        });

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, KEYWORD_RANK_JOB_RECORD_QUEUE_NAME]
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'keyword-rank:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)]
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after keyword rank job save.`);
        }

        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId]
        );
      } catch (err) {
        console.error("Keyword rank worker failed job:", err);
        // Same retriable-vs-permanent mapping heuristic as the schema worker,
        // extended for the SERP provider taxonomy: provider timeouts and
        // transient unavailability map to 'timeout', a misconfigured provider
        // endpoint maps to 'permanent' (no retry can fix the configuration),
        // validation-style input errors map to 'permanent', everything else
        // is 'failed'.
        const errorMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

        let terminalStatus = 'failed';

        if (typeof err === 'object' && err !== null && 'code' in err && typeof (err as any).code === 'string') {
          const code = (err as any).code as string;
          if (code.startsWith('provider.timeout') || code.startsWith('provider.unavailable') || code.startsWith('provider.rate_limited')) {
            terminalStatus = 'timeout';
          } else if (code.startsWith('provider.misconfigured') || code.startsWith('validation.') || code.startsWith('ownership.') || code.startsWith('auth.') || code.startsWith('conflict.')) {
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
    { connection, autorun: true, concurrency: getKeywordRankWorkerConcurrency(options) }
  );

  // Close db client when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
  });

  return worker;
}
