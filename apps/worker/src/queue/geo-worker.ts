import { Worker, type Job } from "bullmq";
import { createDbClient } from "../db/client.js";

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

  const worker = new Worker(
    "geo_readiness_jobs",
    async (job: Job) => {
      const { jobId, url } = job.data;
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Use environment variables for API configuration
        const gseoApiUrl = process.env.GSEO_API_URL || "http://localhost:3001/api/v1";
        const gseoApiKey = process.env.GSEO_API_KEY || "";

        let response;
        try {
          response = await fetch(`${gseoApiUrl}/score/url`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${gseoApiKey}`,
            },
            body: JSON.stringify({ url }), // Send URL in JSON body
          });
        } catch (fetchError) {
           throw new Error(`Failed to reach GSeoSuite scoring API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
        }

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error("Rate limit exceeded from GSeoSuite scoring API");
          }
          throw new Error(`GSeoSuite scoring API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Safe access to the data structure
        const overallScore = data.score ?? data.overall ?? 0;
        const accessScore = data.indexability ?? data.scores?.access ?? 0;
        const understandingScore = data.understanding ?? data.scores?.understanding ?? 0;
        const evidenceScore = data.evidence ?? data.scores?.evidence ?? 0;
        const issues = data.overall_issues ?? data.issues ?? [];

        const mockJsonBResult = JSON.stringify({
          methodologyVersion: "v1.0",
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
