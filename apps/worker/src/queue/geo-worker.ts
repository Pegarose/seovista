import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import {
  ScoringEngine,
  loadCrewCatalog,
  matchServices,
  type ParsedPage,
  type ScoreContext,
} from "@seovista/geo-engine";
import { fetchAndParseUrlWithMeta } from "../utils/fetcher.js";
import { computeLockKey, releaseSingleFlightLock } from "../utils/single-flight.js";
import {
  createCrewQueue,
  createCrewWorker,
  enqueueCrewNotification,
} from "./crew-queue.js";

// Helper to parse redis url for bullmq
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

export interface GeoWorkerOptions {
  /**
   * Override the BullMQ queue name. Defaults to "geo_readiness_jobs".
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
  /**
   * Override the BullMQ crew notification queue name. Defaults to
   * "crew-notifications". Tests pass a unique name so parallel workers /
   * orphaned processes listening on the default queue cannot consume (and
   * skip, or retry) the test's crew notifications before the in-process
   * crew worker does.
   */
  crewQueueName?: string;
  /**
   * Override BullMQ concurrency limit. Defaults to GEO_WORKER_CONCURRENCY env or 3.
   */
  concurrency?: number;
}

export function getGeoWorkerConcurrency(options?: GeoWorkerOptions, env = process.env): number {
  if (options?.concurrency && options.concurrency > 0) {
    return options.concurrency;
  }
  const envConcurrency = Number(env.GEO_WORKER_CONCURRENCY);
  if (envConcurrency > 0) {
    return envConcurrency;
  }
  return 3;
}

interface PersistedSerpPreview {
  title: string;
  snippet: string;
  url: string;
  sourceMode: "simulated";
  displayType: "serp";
  provider: "deterministic-fixture";
  fixtureId: "geo-page-parse-v1";
  requestId: string;
  operationKey: string;
  runId: string;
  capturedAt: string;
  ttlSeconds: number;
  freshness: "fresh";
  outcome: "success";
}

function buildPersistedSerpPreview(
  parsedPage: Pick<ParsedPage, "title" | "metaDescription" | "canonical">,
  requestId: string,
  jobId: unknown,
  capturedAt: string,
): PersistedSerpPreview | undefined {
  const title = parsedPage.title?.trim();
  const snippet = parsedPage.metaDescription?.trim();
  const candidateUrl = parsedPage.canonical?.trim();
  if (!title || !snippet || !candidateUrl) return undefined;

  let url: URL;
  try {
    url = new URL(candidateUrl);
  } catch {
    return undefined;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return undefined;
  }

  const runId = String(jobId);
  return {
    title,
    snippet,
    url: url.toString(),
    sourceMode: "simulated",
    displayType: "serp",
    provider: "deterministic-fixture",
    fixtureId: "geo-page-parse-v1",
    requestId,
    operationKey: `geo:${runId}`,
    runId,
    capturedAt,
    ttlSeconds: 3600,
    freshness: "fresh",
    outcome: "success",
  };
}

export function startGeoWorker(options?: GeoWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start geo worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
  const engine = new ScoringEngine();

  const crewQueue = createCrewQueue(connection, options?.crewQueueName);
  const crewWorker = createCrewWorker(connection, options?.crewQueueName);

  const worker = new Worker(
    options?.queueName ?? "geo_readiness_jobs",
    async (job: Job) => {
      const { jobId, url, forceAudit } = job.data;
      const tier = (job.data.tier && ['free', 'pro', 'agency'].includes(job.data.tier)) ? job.data.tier : 'free';
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Actually fetch and parse the page. `forceAudit: true` bypasses the
        // render cache (VAL-A-SPA-002) so a fresh Browseract render is forced
        // regardless of whether `geo:cache:{sha256(url)}` already holds a hit.
        const { parsedPage } = await fetchAndParseUrlWithMeta(url, { forceAudit: forceAudit === true });

        const scoreContext: ScoreContext = {
          tenantId: "worker-tenant",
          url: url,
          normalizedUrl: url,
          parsed: parsedPage,
          options: {
            includeNeuronWriter: true,
            includePerformance: false,
            includeAiVisibility: true,
            renderJavascript: true,
            storeSnapshot: false,
          },
        };

        const data = await engine.scorePage(scoreContext, Date.now());

        // A completed public result requires the engine's finite contract score.
        // Do not replace missing or malformed evidence with a fabricated zero.
        if (!Number.isFinite(data.finalScore) || data.finalScore < 0 || data.finalScore > 100) {
          throw new Error("Scoring engine returned an invalid final score");
        }
        const overallScore = data.finalScore;

        // Map each engine module to one of the three saved score dimensions.
        // Module keys come from packages/geo-engine/src/modules/* (e.g.
        // `indexability_crawlability`, `semantic_coverage`, etc.). The previous
        // implementation compared against non-existent keys (`indexability`,
        // `semantic`, `content`, `evidence`, `experience`), so no branch ever
        // matched and every dimension score was saved as 0.
        const MODULE_DIMENSION_MAP: Record<string, 'access' | 'understanding' | 'evidence'> = {
          indexability_crawlability: 'access',
          technical_seo_metadata: 'access',
          internal_linking_architecture: 'access',
          semantic_coverage: 'understanding',
          content_quality_intent: 'understanding',
          ai_visibility_readiness: 'understanding',
          page_experience_performance: 'evidence',
        };

        const dimensionScores: Record<'access' | 'understanding' | 'evidence', number[]> = {
          access: [],
          understanding: [],
          evidence: [],
        };

        for (const mod of data.modules) {
          const dimension = MODULE_DIMENSION_MAP[mod.key];
          if (dimension) {
            dimensionScores[dimension].push(mod.score);
          }
        }

        const mean = (nums: number[]): number =>
          nums.length > 0 ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;

        const accessScore = mean(dimensionScores.access);
        const understandingScore = mean(dimensionScores.understanding);
        const evidenceScore = mean(dimensionScores.evidence);

        const issues = data.topIssues ?? [];
        const catalog = loadCrewCatalog();
        const matchedServices = matchServices(issues, catalog);

        // Per-module score breakdown (VAL-A-UI-001 / VAL-A-UI-002). Persisted
        // into the job_results payload so the result-page RSC can render the
        // module contributions + per-issue point-loss and the score_version
        // metadata strip WITHOUT recomputing any score. The breakdown is a
        // deterministic projection of the scoring core, so it is safe to
        // store alongside the existing trimmed result shape.
        const breakdown = data.breakdown;

        const jobRecordRes = await db.query(`SELECT job_identity, correlation_id FROM job_records WHERE id = $1`, [jobId]);
        if (jobRecordRes.rows.length === 0) {
            throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
            throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;
        const capturedAt = new Date().toISOString();
        const serpPreview = buildPersistedSerpPreview(parsedPage, correlation_id, jobId, capturedAt);

        const mockJsonBResult = JSON.stringify({
          methodologyVersion: data.scoreVersion || "v1.1",
          auditedAt: capturedAt,
          target: url,
          scores: {
            overall: overallScore,
            access: accessScore,
            understanding: understandingScore,
            evidence: evidenceScore,
          },
          scoreVersion: data.scoreVersion,
          breakdown,
          issues,
          matchedServices,
          tier,
          ...(serpPreview ? { serpPreview } : {}),
        });

        const jobResultRes = await db.query(
            `INSERT INTO job_results (correlation_id, job_identity, result_type, payload) 
             VALUES ($1, $2, 'geo:result', $3) RETURNING id`,
            [correlation_id, job_identity, mockJsonBResult]
        );
        const rawResultRes = jobResultRes.rows[0];
        if (!rawResultRes) {
            throw new Error(`Failed to return result ID after geo job save.`);
        }
        
        const resultId = rawResultRes.id;
        
        await db.query(`UPDATE job_records SET status = 'completed', result_id = $2, completed_at = now(), updated_at = now() WHERE id = $1`, [jobId, resultId]);

        // Release the single-flight lock (VAL-A-MIT-002). The 300s TTL is the
        // crash backstop; an explicit release on completion lets a re-audit of
        // the same URL proceed immediately instead of waiting for expiry.
        // Compare-and-delete ensures we only release our own lock.
        await releaseSingleFlightLock(computeLockKey(url), String(jobId));

        // Fire Crew Agency webhook via Async Queue with retry (3 attempts & backoff)
        await enqueueCrewNotification(crewQueue, {
          url,
          brand: extractBrandFromUrl(url),
          score: overallScore,
          scoreBand: data.scoreBand,
          lowScores: {
            access: accessScore,
            understanding: understandingScore,
            evidence: evidenceScore,
          },
          topIssues: issues.slice(0, 5).map((issue) => ({
            code: issue.code,
            title: issue.title,
            severity: issue.severity,
          })),
          proposalTrigger: overallScore < 60 || data.scoreBand === 'critical' || data.scoreBand === 'poor',
          correlationId: correlation_id,
          jobIdentity: job_identity,
          resultId: resultId,
          analysisSummary: buildAnalysisSummary(url, overallScore, data.scoreBand, issues),
          matchedServices: matchedServices.map((s) => s.name),
          tier,
        }).catch((notifyErr) => {
          // Webhook queueing failure must not fail the geo job; log and continue
          console.error("Crew Agency notification queueing failed:", notifyErr);
        });

      } catch (err) {
        console.error("Worker failed job:", err);
        // Map retriable vs permanent failure explicitly according to the spec:
        // Use timeout/unavailable for retryable, permanent for others.
        // Assuming BullMQ retries will dictate the attempt handling outside this logic
        // We will default to failed, but realistically we map timeout explicitly
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
        // Release the single-flight lock on failure too, so the URL is not
        // pinned until TTL expiry when the job errors out. Compare-and-delete
        // guards against deleting a re-acquired lock.
        await releaseSingleFlightLock(computeLockKey(url), String(jobId));
        throw err;
      }
    },
    { connection, autorun: true, concurrency: getGeoWorkerConcurrency(options) }
  );
  
  // Close db client and crew queue/worker when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
    crewQueue.close().catch(console.error);
    crewWorker.close().catch(console.error);
  });
  
  return worker;
}

function extractBrandFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildAnalysisSummary(
  url: string,
  score: number,
  scoreBand: string,
  issues: Array<{ code: string; title: string; severity: string }>
): string {
  const summaryLines = [
    `SeoVista GEO analysis completed for ${url}`,
    `Overall score: ${score} (${scoreBand})`,
  ];

  if (issues.length > 0) {
    summaryLines.push(`Top issues: ${issues.slice(0, 3).map((i) => i.title).join("; ")}`);
  }

  return summaryLines.join(". ");
}

