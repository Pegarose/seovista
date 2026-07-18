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
  } catch (e) {
    return { host: "127.0.0.1", port: 56379 };
  }
}

export function startGeoWorker() {
  const connection = parseRedisUrl(process.env.REDIS_URL);
  
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start geo worker");
  }
  
  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  return new Worker(
    "geo_readiness_jobs",
    async (job: Job) => {
      const { jobId, url } = job.data;
      
      try {
        await db.query(`UPDATE job_records SET status = 'running', updated_at = now() WHERE id = $1`, [jobId]);

        // Place simulated OpenSEO adapter latency fetcher mock (will be replaced by full wrapper in next phases)
        await new Promise((resolve) => setTimeout(resolve, 3500)); 

        const mockJsonBResult = JSON.stringify({
          methodologyVersion: "v1.0",
          auditedAt: new Date().toISOString(),
          target: url,
          scores: { access: 100, understanding: 78, evidence: 50, overall: 76 }
        });

        await db.query(
            `INSERT INTO job_results (job_id, result_data) VALUES ($1, $2) ON CONFLICT (job_id) DO UPDATE SET result_data = EXCLUDED.result_data`,
            [jobId, mockJsonBResult]
        );
        
        await db.query(`UPDATE job_records SET status = 'completed', updated_at = now() WHERE id = $1`, [jobId]);

      } catch (err) {
        await db.query(`UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`, [jobId]);
        throw err;
      }
    },
    { connection, autorun: true }
  );
}
