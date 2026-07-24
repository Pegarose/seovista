#!/usr/bin/env tsx
/**
 * User-testing validator probe script for trust-foundation behavioral assertions.
 * Exercises the REAL worker submission path (submitGeoAudit) against the live
 * BullMQ worker, Redis DB 1, and Postgres. The running worker (port 3300
 * process) processes the enqueued jobs and logs fetcher/cache/sentry events
 * to its stdout (captured in .tmp/worker.log).
 *
 * Subcommands:
 *   spa <url>            Submit <url> cold (forceAudit=false), wait, then re-submit cached.
 *   force <url>          Submit <url> with forceAudit=true (cache bypass).
 *   concurrent <url> <n> Fire <n> concurrent submitGeoAudit for <url>; report distinct jobIds.
 *   creditguard <url>    Submit <url> once (expects Cheerio fallback when counter >= limit).
 *
 * Env: DATABASE_URL, REDIS_URL must be set in the process environment.
 */
import { createDbClient, createGeoAuditRepository, submitGeoAudit } from "../apps/worker/dist/index.js";

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
if (!DATABASE_URL || !REDIS_URL) {
  console.error("DATABASE_URL and REDIS_URL must be set");
  process.exit(2);
}

const db = createDbClient({ connectionString: DATABASE_URL });
const repo = createGeoAuditRepository(db);

async function waitForJob(jobId: string, timeoutMs = 200000): Promise<{ status: string; cacheKey?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await repo.getJobRecord(jobId).catch(() => null);
    if (row && (row.status === "completed" || row.status === "failed")) {
      return { status: row.status, cacheKey: (row as { cache_key?: string }).cache_key };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "timeout" };
}

async function leadFor(url: string): Promise<string> {
  const lead = await repo.createLead({ domain: url, brandName: "ValidatorProbe", primaryMarket: "GLOBAL" });
  return lead.id;
}

async function spa(url: string): Promise<void> {
  // Cold submission
  const lead1 = await leadFor(url);
  const r1 = await submitGeoAudit({ db, redisUrl: REDIS_URL, url, leadId: lead1, forceAudit: false });
  console.log(JSON.stringify({ probe: "spa", phase: "cold", jobId: r1.jobId, deduped: r1.deduped }));
  const w1 = await waitForJob(r1.jobId);
  console.log(JSON.stringify({ probe: "spa", phase: "cold_done", jobId: r1.jobId, status: w1.status, cacheKey: w1.cacheKey }));

  // Cached re-submission
  const lead2 = await leadFor(url);
  const r2 = await submitGeoAudit({ db, redisUrl: REDIS_URL, url, leadId: lead2, forceAudit: false });
  console.log(JSON.stringify({ probe: "spa", phase: "cached", jobId: r2.jobId, deduped: r2.deduped }));
  const w2 = await waitForJob(r2.jobId);
  console.log(JSON.stringify({ probe: "spa", phase: "cached_done", jobId: r2.jobId, status: w2.status }));
}

async function force(url: string): Promise<void> {
  const lead = await leadFor(url);
  const r = await submitGeoAudit({ db, redisUrl: REDIS_URL, url, leadId: lead, forceAudit: true });
  console.log(JSON.stringify({ probe: "force", jobId: r.jobId, deduped: r.deduped }));
  const w = await waitForJob(r.jobId);
  console.log(JSON.stringify({ probe: "force_done", jobId: r.jobId, status: w.status }));
}

async function concurrent(url: string, n: number): Promise<void> {
  const leads = await Promise.all(Array.from({ length: n }, () => leadFor(url)));
  const results = await Promise.all(
    leads.map((leadId) =>
      submitGeoAudit({ db, redisUrl: REDIS_URL, url, leadId, forceAudit: false })
        .then((r) => ({ jobId: r.jobId, deduped: r.deduped }))
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    ),
  );
  const jobIds = results.filter((r) => "jobId" in r).map((r) => (r as { jobId: string }).jobId);
  const distinct = new Set(jobIds);
  console.log(JSON.stringify({ probe: "concurrent", n, jobIds, distinctCount: distinct.size, distinct: [...distinct], results }));
  // Wait for the single job to finish
  const single = [...distinct][0];
  if (single) {
    const w = await waitForJob(single);
    console.log(JSON.stringify({ probe: "concurrent_done", jobId: single, status: w.status, cacheKey: w.cacheKey }));
  }
}

async function creditguard(url: string): Promise<void> {
  const lead = await leadFor(url);
  const r = await submitGeoAudit({ db, redisUrl: REDIS_URL, url, leadId: lead, forceAudit: true });
  console.log(JSON.stringify({ probe: "creditguard", jobId: r.jobId, deduped: r.deduped }));
  const w = await waitForJob(r.jobId);
  console.log(JSON.stringify({ probe: "creditguard_done", jobId: r.jobId, status: w.status }));
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  const arg2 = process.argv[4];
  try {
    if (cmd === "spa") await spa(arg);
    else if (cmd === "force") await force(arg);
    else if (cmd === "concurrent") await concurrent(arg, parseInt(arg2 ?? "10", 10));
    else if (cmd === "creditguard") await creditguard(arg);
    else {
      console.error("Unknown command: " + cmd);
      process.exit(2);
    }
  } finally {
    await db.close().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ probe: "fatal", error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
