import console from "node:console";
import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { fetchWithValidatedRedirects } from "../utils/fetcher.js";
import { processAttributionTracePayload } from "../processors/attribution-trace.js";
import { resolveSerpProvider } from "../utils/serp-provider.js";
import { DEFAULT_BROWSER_UA, extractVisibleText } from "@seovista/seo-core";
import {
  ATTRIBUTION_TRACE_JOB_RECORD_QUEUE_NAME,
  ATTRIBUTION_TRACE_QUEUE_NAME,
} from "./attribution-trace-submission.js";

function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) return { host: "127.0.0.1", port: 8637 };
  try {
    const url = new URL(redisUrl);
    return { host: url.hostname || "127.0.0.1", port: parseInt(url.port, 10) || 8637 };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

export interface AttributionTraceWorkerOptions {
  queueName?: string;
  /** Defaults to ATTRIBUTION_TRACE_WORKER_CONCURRENCY env or 2. */
  concurrency?: number;
}

export function getAttributionTraceWorkerConcurrency(
  options?: AttributionTraceWorkerOptions,
  env = process.env,
): number {
  if (options?.concurrency && options.concurrency > 0) return options.concurrency;
  const envConcurrency = Number(env.ATTRIBUTION_TRACE_WORKER_CONCURRENCY);
  if (envConcurrency > 0) return envConcurrency;
  return 2;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ANSWER_CHARS = 8000;
const DEFAULT_SERP_KEYWORD_LIMIT = 5;

export function startAttributionTraceWorker(options?: AttributionTraceWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start attribution trace worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.ATTRIBUTION_TRACE_QUEUE_NAME ?? ATTRIBUTION_TRACE_QUEUE_NAME,
    async (job: Job) => {
      const { jobId, domain, answer, keyword } = job.data as {
        jobId: string;
        domain: string;
        answer: string;
        keyword?: string;
      };

      const trimmedAnswer = typeof answer === "string" ? answer.slice(0, MAX_ANSWER_CHARS) : "";
      const trimmedKeyword =
        typeof keyword === "string" && keyword.trim().length > 0
          ? keyword.trim().slice(0, 120)
          : undefined;

      try {
        await db.query(
          `UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`,
          [jobId],
        );

        // 1) Fetch the site's own home page (the "self" source) via the SSRF-
        //    hardened fetcher.
        const selfResp = await fetchWithValidatedRedirects(`https://${domain}/`, {
          maxBodyBytes: MAX_BODY_BYTES,
          headers: { "User-Agent": DEFAULT_BROWSER_UA },
        });

        // 2) Optionally resolve the configured SERP provider. A misconfigured
        //    provider or an unset SEARXNG_BASE_URL degrades to the
        //    deterministic mock — same posture as the other tools.
        let serpSources: import("@seovista/seo-core").SourceDocument[] = [];
        if (trimmedKeyword) {
          try {
            const provider = resolveSerpProvider();
            const entries = (await provider.search(trimmedKeyword, "tr-TR", domain)).slice(
              0,
              DEFAULT_SERP_KEYWORD_LIMIT,
            );
            serpSources = entries.map((entry, idx) => ({
              id: `serp:${idx + 1}`,
              label: entry.title ?? `SERP #${idx + 1}`,
              url: entry.url,
              kind: "external" as const,
              text: [entry.title ?? "", entry.snippet ?? ""].join(" ").trim(),
            }));
          } catch (providerError) {
            console.warn(
              `SERP provider failed during attribution trace; continuing with self-only sources: ${(providerError as Error).message}`,
            );
          }
        }

        const result = processAttributionTracePayload({
          answer: trimmedAnswer,
          selfText: extractVisibleText(selfResp.body),
          domain,
          serpSources,
        });

        const jobRecordRes = await db.query(
          `SELECT job_identity, correlation_id FROM job_records WHERE id = $1 AND queue_name = $2`,
          [jobId, ATTRIBUTION_TRACE_JOB_RECORD_QUEUE_NAME],
        );
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
          throw new Error(`Attribution trace job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

        const jobResultRes = await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'attribution-trace:result', $3) RETURNING id`,
          [correlation_id, job_identity, JSON.stringify(result)],
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
          throw new Error(`Failed to return result ID after attribution trace job save.`);
        }
        const resultId = rawResultRes.id;

        await db.query(
          `UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId, resultId],
        );
      } catch (err) {
        console.error("Attribution trace worker failed job:", err);
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
    { connection, autorun: true, concurrency: getAttributionTraceWorkerConcurrency(options) },
  );

  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
