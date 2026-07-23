import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Queue, type Worker } from "bullmq";
import { startGeoWorker } from "../queue/geo-worker.js";
import { setupTestEnvironment, type TestEnvironment } from "./helpers/test-env.js";

/**
 * Polls job_records until the worker drives the job to a terminal status
 * (completed/failed), or gives up after timeoutMs. Replaces fragile fixed
 * setTimeout waits that flake under heavy full-suite load.
 */
async function waitForJobStatus(
  db: TestEnvironment["db"],
  jobId: unknown,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await db.query("SELECT status FROM job_records WHERE id = $1", [jobId]);
    const status = res.rows[0]?.status;
    if (status === "completed" || status === "failed") {
      return status as string;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "timeout";
}

describe("geo-worker", () => {
  let env: TestEnvironment;
  let worker: Worker;
  let queue: Queue;
  // Unique per-run queue name so the parallel infrastructure test's spawned
  // production worker (and any orphaned workers on the default "bull" prefix)
  // cannot compete for this test's jobs on the shared "geo_readiness_jobs" queue.
  let queueName: string;

  beforeEach(async () => {
    env = await setupTestEnvironment();
    process.env.DATABASE_URL = env.databaseUrl;
    process.env.REDIS_URL = env.redisUrl;
    // Worker integration tests exercise the real fetcher + ScoringEngine pipeline.
    // Force the deterministic cheerio fetch path and graceful NeuronWriter fallback
    // so the test never depends on live external provider traffic or credentials.
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.NEURONWRITER_API_KEY;
    queueName = `geo_readiness_jobs_${env.projectId}`;

    queue = new Queue(queueName, {
      connection: { url: env.redisUrl },
    });
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.close();
    }
    
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await env.cleanup();
  });

  it("successfully scores a URL and saves results", async () => {
    // The worker now fetches the target page via fetchAndParseUrl and scores it through
    // the in-process ScoringEngine (no external nextg proxy). Mock global fetch to return
    // minimal HTML so the cheerio fetcher path yields a ParsedPage; the engine then
    // computes scores from that page and the worker persists a geo:result row.
    const sampleHtml =
      "<!doctype html><html><head><title>Example Domain</title>" +
      '<meta name="description" content="Example domain for use in illustrative examples.">' +
      "</head><body><main><h1>Example Domain</h1>" +
      "<p>This domain is for use in illustrative examples in documents.</p></main></body></html>";

    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => sampleHtml,
      json: async () => ({}),
      headers: { forEach: () => undefined },
    }));
    vi.stubGlobal("fetch", fetchMock);

    worker = startGeoWorker({ queueName });

    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity", queueName, "queued", "https://example.com", "geo-test-corr-id"]
    );
    const jobIdInDb = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobIdInDb,
      url: "https://example.com",
    });

    const actualStatus = await waitForJobStatus(env.db, jobIdInDb);
    expect(fetchMock).toHaveBeenCalled();
    expect(actualStatus).toBe("completed");

    if (actualStatus === "completed") {
      const jobResults = await env.db.query("SELECT * FROM job_results WHERE correlation_id = $1", ["geo-test-corr-id"]);
      const resultData = typeof jobResults.rows[0]?.payload === "string"
        ? JSON.parse(jobResults.rows[0]?.payload)
        : jobResults.rows[0]?.payload;

      expect(resultData).toBeTruthy();
      expect(resultData?.target).toBe("https://example.com");
      expect(typeof resultData?.scores?.overall).toBe("number");
    }
  });

  it("handles 429 rate limit correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });
    vi.stubGlobal("fetch", fetchMock);

    worker = startGeoWorker({ queueName });
    
    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-2", queueName, "queued", "https://rate-limit.com", "geo-test-corr-id-2"]
    );
    const jobIdInDb = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobIdInDb,
      url: "https://rate-limit.com",
    });

    const errorDetails = await waitForJobStatus(env.db, jobIdInDb);
    expect(errorDetails).toBe("failed");
  });
});