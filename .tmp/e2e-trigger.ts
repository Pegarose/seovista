import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// Anchor module resolution at the worker package so bullmq + pg resolve
// from apps/worker/node_modules (the .tmp dir has no node_modules).
const require = createRequire(
  "C:\\bc-proje\\Seovista\\apps\\worker\\package.json"
);
const { Queue } = require("bullmq") as typeof import("bullmq");
const pg = require("pg") as typeof import("pg");

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://seovista:seovista@localhost:55432/seovista";
const TARGET_URL = "https://example.com";
const QUEUE_NAME = "geo_readiness_jobs";

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const jobIdentity = randomUUID();
  const correlationId = randomUUID();

  // 1. Insert job_records row with status 'queued' (valid transition queued->running)
  const ins = await pool.query(
    `INSERT INTO job_records (job_identity, queue_name, correlation_id, target, status)
     VALUES ($1, $2, $3, $4, 'queued')
     RETURNING id`,
    [jobIdentity, QUEUE_NAME, correlationId, TARGET_URL]
  );
  const jobId = ins.rows[0].id;
  console.log("JOB_RECORD_INSERTED", jobId);

  // 2. Enqueue BullMQ job with matching jobId + url
  const queue = new Queue(QUEUE_NAME, {
    connection: { host: "127.0.0.1", port: 56379 },
  });
  await queue.add("audit", { jobId, url: TARGET_URL }, { jobId: jobIdentity });
  console.log("JOB_ADDED", jobId);
  await queue.close();
  await pool.end();
}

main().catch((e) => {
  console.error("TRIGGER_FAIL", e);
  process.exit(1);
});
