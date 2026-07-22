import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";
import { ScoringEngine, type ScoreContext } from "@seovista/geo-engine";
import { fetchAndParseUrl } from "../utils/fetcher.js";

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

export function startGeoWorker() {
  const connection = parseRedisUrl(process.env.REDIS_URL);
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start geo worker");
  }
  
  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });
  const engine = new ScoringEngine();

  const worker = new Worker(
    "geo_readiness_jobs",
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
