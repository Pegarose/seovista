import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Queue, Worker } from "bullmq";
import { startGeoWorker } from "../queue/geo-worker.js";
import { setupTestEnvironment, type TestEnvironment } from "./helpers/test-env.js";

describe("geo-worker", () => {
  let env: TestEnvironment;
  let worker: Worker;
  let queue: Queue;

  beforeEach(async () => {
    env = await setupTestEnvironment();
    process.env.DATABASE_URL = env.databaseUrl;
    process.env.REDIS_URL = env.redisUrl;

    queue = new Queue("geo_readiness_jobs", {
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
    let capturedBody: any = null;
    let capturedHeaders: any = null;

    const fetchMock = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      capturedHeaders = opts.headers;

      return {
        ok: true,
        json: async () => ({
          score: 85,
          indexability: 100,
          understanding: 90,
          evidence: 80,
          overall_issues: ["test issue"],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    worker = startGeoWorker();

    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity", "geo_readiness_jobs", "queued", "https://example.com", "geo-test-corr-id"]
    );
    const jobIdInDb = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobIdInDb,
      url: "https://example.com",
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:3001/api/v1/score/url");
    expect(capturedBody).toEqual({ url: "https://example.com" });
    expect(capturedHeaders?.Authorization).toBe("Bearer ");

    const jobRecords = await env.db.query("SELECT * FROM job_records WHERE id = $1", [jobIdInDb]);
    const actualStatus = jobRecords.rows[0]?.status;
    expect(actualStatus).toBe("completed");

    if (actualStatus === "completed") {
      const jobResults = await env.db.query("SELECT * FROM job_results WHERE correlation_id = $1", ["geo-test-corr-id"]);
      const resultData = typeof jobResults.rows[0]?.payload === "string" 
        ? JSON.parse(jobResults.rows[0]?.payload) 
        : jobResults.rows[0]?.payload;
      
      expect(resultData?.scores?.overall).toBe(85);
      expect(resultData?.scores?.access).toBe(100);
      expect(resultData?.scores?.understanding).toBe(90);
      expect(resultData?.scores?.evidence).toBe(80);
      expect(resultData?.issues).toEqual(["test issue"]);
    }
  });

  it("handles 429 rate limit correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });
    vi.stubGlobal("fetch", fetchMock);

    worker = startGeoWorker();
    
    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-2", "geo_readiness_jobs", "queued", "https://rate-limit.com", "geo-test-corr-id-2"]
    );
    const jobIdInDb = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobIdInDb,
      url: "https://rate-limit.com",
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const jobRecords = await env.db.query("SELECT * FROM job_records WHERE id = $1", [jobIdInDb]);
    const errorDetails = jobRecords.rows[0]?.status;
    expect(errorDetails).toBe("failed");
  });
});