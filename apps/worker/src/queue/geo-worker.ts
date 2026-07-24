import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { ScoringEngine, type ScoreContext } from "@seovista/geo-engine";
import { fetchAndParseUrl } from "../utils/fetcher.js";

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
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Actually fetch and parse the page. `forceAudit: true` bypasses the
        // render cache (VAL-A-SPA-002) so a fresh Browseract render is forced
        // regardless of whether `geo:cache:{sha256(url)}` already holds a hit.
        const parsedPage = await fetchAndParseUrl(url, { forceAudit: forceAudit === true });

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
        }).catch((notifyErr) => {
          // Webhook failures must not fail the geo job; log and continue
          console.error("Crew Agency notification failed:", notifyErr);
        });

      } catch (err) {
        console.error("Worker failed job:", err);
        await db.query(`UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`, [jobId]);
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
  const topIssuesText = payload.topIssues
    .slice(0, 3)
    .map((issue) => issue.title)
    .join(", ");

  const apiPayload = {
    musteri_ihtiyaci: `GEO visibility analysis for ${payload.url}: Score ${payload.score}/100 (${payload.scoreBand}). Critical issues: ${topIssuesText || "none"}. Needs SEO/AEO improvement services.`,
    brand_context: `SeoVista analysis for ${payload.brand}: Overall score ${payload.score}, issues detected: ${payload.analysisSummary}`,
    dil: "tr",
  };

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(apiPayload),
  });

  if (!response.ok) {
    throw new Error(`Crew Agency notification failed: ${response.status} ${response.statusText}`);
  }

  // The API returns { "job_id": "<uuid>" } for the async job. Log it for tracking.
  try {
    const responseBody = await response.json() as { job_id?: string };
    if (responseBody.job_id) {
      console.log("Crew Agency job started:", responseBody.job_id);
    }
  } catch {
    // Response wasn't JSON or didn't contain job_id; non-fatal.
  }

  console.log(`Crew Agency notification sent to ${targetUrl} for ${payload.url}`);
}
