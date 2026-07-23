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
      const { jobId, url } = job.data;
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Actually fetch and parse the page
        const parsedPage = await fetchAndParseUrl(url);

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
        
        let accessScore = 0;
        let understandingScore = 0;
        let evidenceScore = 0;
        
        for (const mod of data.modules) {
          if (mod.key === 'indexability') accessScore = mod.score;
          if (mod.key === 'semantic' || mod.key === 'content') understandingScore += mod.score / 2; // rough estimation if needed
          if (mod.key === 'evidence' || mod.key === 'experience') evidenceScore = mod.score;
        }

        const issues = data.topIssues ?? [];

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
  const baseUrl = process.env.CREW_AGENCY_API_URL ?? "https://crew.tr4.net/api";
  return `${baseUrl.replace(/\/$/, "")}/teklif-yaz`;
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

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Crew Agency notification failed: ${response.status} ${response.statusText}`);
  }

  console.log(`Crew Agency notification sent to ${targetUrl} for ${payload.url}`);
}
