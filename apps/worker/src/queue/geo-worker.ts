import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import {
  ScoringEngine,
  loadCrewCatalog,
  matchServices,
  type MatchedService,
  type ScoreContext,
  type ScoreOutput,
} from "@seovista/geo-engine";
import { fetchAndParseUrlWithMeta } from "../utils/fetcher.js";
import { computeLockKey, releaseSingleFlightLock } from "../utils/single-flight.js";
import { emitAuditCompleted, emitCrewFailureBreadcrumb, type PerPlatformConfidence } from "../utils/sentry.js";

export interface CrewAgencyPayload {
  url: string;
  brand: string;
  score: number;
  scoreBand: string;
  lowScores: Record<string, number>;
  topIssues: Array<{ code: string; title: string; severity: string }>;
  proposalTrigger: boolean;
  correlationId: string;
  jobIdentity: string;
  resultId: string;
  analysisSummary: string;
  matchedServices: MatchedService[];
  tier: string;
}

// Helper to parse redis url for bullmq
function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) {
    return { host: "127.0.0.1", port: 56379 };
  }
  
  try {
    const url = new URL(redisUrl);
    return { 
      host: url.hostname || "127.0.0.1", 
      port: parseInt(url.port, 10) || 56379 
    };
  } catch {
    return { host: "127.0.0.1", port: 56379 };
  }
}

export interface GeoWorkerOptions {
  /**
   * Override the BullMQ queue name. Defaults to "geo_readiness_jobs".
   * Tests pass a unique name so parallel workers / orphaned processes
   * listening on the default queue cannot steal their jobs.
   */
  queueName?: string;
}

export function startGeoWorker(options?: GeoWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start geo worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
  const engine = new ScoringEngine();

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
        // `cacheHit` flows into the `audit_completed` Sentry event (VAL-A-OBS-002).
        const { parsedPage, cacheHit } = await fetchAndParseUrlWithMeta(url, { forceAudit: forceAudit === true });

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

        // Safe access to the data structure
        const overallScore = data.finalScore ?? 0;

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

        const mockJsonBResult = JSON.stringify({
          methodologyVersion: data.scoreVersion || "v1.1",
          auditedAt: new Date().toISOString(),
          target: url,
          scores: {
            overall: overallScore,
            access: accessScore,
            understanding: understandingScore,
            evidence: evidenceScore,
          },
          scoreVersion: data.scoreVersion,
          breakdown,
          issues: issues,
          matchedServices,
          tier,
        });

        const jobRecordRes = await db.query(`SELECT job_identity, correlation_id FROM job_records WHERE id = $1`, [jobId]);
        if (jobRecordRes.rows.length === 0) {
            throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const rawJobRecord = jobRecordRes.rows[0];
        if (!rawJobRecord) {
            throw new Error(`Job record ${jobId} not found during result saving.`);
        }
        const { job_identity, correlation_id } = rawJobRecord;

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

        // Phase A — VAL-A-OBS-002: emit the `audit_completed` Sentry event
        // (or stub-sink JSON in dev) with the four required observability
        // fields: `score_value`, `per_platform_confidence`, `cache_hit`,
        // `tier`. Fire-and-forget — telemetry must never fail the job.
        emitAuditCompletedOnce({
          jobId: String(jobId),
          correlationId: correlation_id,
          url,
          score_value: overallScore,
          per_platform_confidence: buildPerPlatformConfidence(data),
          cache_hit: cacheHit,
          tier: tier,
        });

        // Fire Crew Agency webhook immediately after DB update completes
        await notifyCrewAgency({
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
          matchedServices,
          tier,
        }).catch((notifyErr) => {
          // Webhook failures must not fail the geo job; log and continue
          console.error("Crew Agency notification failed:", notifyErr);
          emitCrewFailureBreadcrumb({
            url,
            jobId: String(jobId),
            correlationId: correlation_id,
            errorMessage: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        });

      } catch (err) {
        console.error("Worker failed job:", err);
        await db.query(`UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`, [jobId]);
        // Release the single-flight lock on failure too, so the URL is not
        // pinned until TTL expiry when the job errors out. Compare-and-delete
        // guards against deleting a re-acquired lock.
        await releaseSingleFlightLock(computeLockKey(url), String(jobId));
        throw err;
      }
    },
    { connection, autorun: true }
  );
  
  // Close db client when worker closes to avoid hanging connection
  worker.on('closed', () => {
    db.close().catch(console.error);
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

function buildCrewAgencyUrl(): string {
  const baseUrl = (process.env.CREW_AGENCY_API_URL ?? "https://crew.tr4.net/api").replace(/\/$/, "");
  // Ensure the path always includes `/api` before `/teklif-yaz`.
  // Handles both `http://crew.tr4.net` and `http://crew.tr4.net/api`.
  const withApi = /\/api$/.test(baseUrl) ? baseUrl : `${baseUrl}/api`;
  return `${withApi}/teklif-yaz`;
}

function resolveCrewAgencyApiKey(): string | undefined {
  return process.env.CREW_AGENCY_API_KEY;
}

async function notifyCrewAgency(payload: CrewAgencyPayload): Promise<void> {
  const apiKey = resolveCrewAgencyApiKey();
  if (!apiKey) {
    console.warn("CREW_AGENCY_API_KEY is not configured; skipping Crew Agency notification");
    return;
  }

  const targetUrl = buildCrewAgencyUrl();

  // Map internal analysis data to the Crew Agency API's expected payload format.
  // The API is async: POST returns a job_id immediately, results are fetched via
  // GET /api/jobs/{job_id}. We fire-and-forget but log job_id for tracking.
  const apiPayload = {
    url: payload.url,
    brand: payload.brand,
    score: payload.score,
    scoreBand: payload.scoreBand,
    lowScores: payload.lowScores,
    topIssues: payload.topIssues,
    proposalTrigger: Boolean(payload.proposalTrigger),
    correlationId: payload.correlationId,
    jobIdentity: payload.jobIdentity,
    resultId: payload.resultId,
    analysisSummary: payload.analysisSummary,
    matchedServices: payload.matchedServices,
    tier: payload.tier,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(apiPayload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    const err = new Error(`Crew Agency notification failed: ${status} ${response.statusText}`);
    (err as any).status = status;
    throw err;
  }

  // The API returns { "job_id": "<uuid>" } for the async job. Log it for tracking.
  try {
    const responseBody = await response.json() as { job_id?: string };
    if (responseBody.job_id) {
      console.log(`Crew Agency job started: ${responseBody.job_id} for ${payload.url} [correlationId: ${payload.correlationId}]`);
    } else {
      console.log(`Crew Agency notification sent for ${payload.url} [correlationId: ${payload.correlationId}]`);
    }
  } catch {
    // Response wasn't JSON or didn't contain job_id; non-fatal.
    console.log(`Crew Agency notification sent for ${payload.url} [correlationId: ${payload.correlationId}]`);
  }
}

/**
 * Wraps {@link emitAuditCompleted} so a telemetry failure can never fail the
 * geo job. The Sentry bridge already swallows emit errors internally, but an
 * extra guard here keeps the audit pipeline resilient even if the bridge
 * itself throws before its internal try/catch (e.g. bad payload shape).
 */
function emitAuditCompletedOnce(payload: {
  jobId: string;
  correlationId?: string;
  url: string;
  score_value: number;
  per_platform_confidence: PerPlatformConfidence;
  cache_hit: boolean;
  tier: string;
}): void {
  try {
    emitAuditCompleted(payload);
  } catch {
    // Telemetry must never block / fail the completed audit.
  }
}

/**
 * Builds the `per_platform_confidence` map for the `audit_completed` event.
 *
 * Prefers the AI Visibility breakdown's per-platform `confidence` (0–1)
 * values (the engine's trust in each platform estimate). When the breakdown
 * is empty (e.g. AI Visibility module produced no data), falls back to the
 * top-level `platformReadiness` numeric readiness scores (0–100) so the field
 * is always populated with a valid number per platform — the contract only
 * requires the four fields be present with correct types.
 *
 * Platform display names from the breakdown ("ChatGPT", "Perplexity",
 * "Google AI Overviews", "Bing Copilot") are normalized to the engine's
 * `platformReadiness` keys (`chatgpt`, `perplexity`, `googleAiOverviews`,
 * `bingCopilot`).
 */
function buildPerPlatformConfidence(data: ScoreOutput): PerPlatformConfidence {
  const fallback: PerPlatformConfidence = {
    chatgpt: data.platformReadiness.chatgpt,
    perplexity: data.platformReadiness.perplexity,
    googleAiOverviews: data.platformReadiness.googleAiOverviews,
    bingCopilot: data.platformReadiness.bingCopilot,
  };

  const breakdown = data.breakdown?.platformReadiness;
  if (!breakdown || breakdown.length === 0) {
    return fallback;
  }

  const keyByPlatformName: Record<string, keyof PerPlatformConfidence> = {
    chatgpt: "chatgpt",
    perplexity: "perplexity",
    "google ai overviews": "googleAiOverviews",
    "bing copilot": "bingCopilot",
  };

  const result: PerPlatformConfidence = { ...fallback };
  for (const entry of breakdown) {
    const key = keyByPlatformName[entry.platform.toLowerCase()];
    if (!key) continue;
    if (typeof entry.confidence === "number" && Number.isFinite(entry.confidence)) {
      result[key] = entry.confidence;
    }
  }
  return result;
}

