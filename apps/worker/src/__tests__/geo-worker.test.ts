import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Queue, type Worker } from "bullmq";
import { startGeoWorker } from "../queue/geo-worker.js";
// vi.mock's importOriginal must be typed with `typeof <module>`; an `import type * as`
// namespace cannot be used inside `typeof`, and `typeof import("...")` is forbidden by
// consistent-type-imports, so a value import is the only viable typing here.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as sentryModule from "../utils/sentry.js";
import { setupTestEnvironment, type TestEnvironment } from "./helpers/test-env.js";

// Hoisted spy shared with the top-level vi.mock below. vi.hoisted runs before any
// import resolves, so the mock factory can close over the spy and the mock is in
// place before geo-worker.ts loads the sentry module (an in-test vi.mock would be
// too late and leave the spy uncalled).
const { crewBreadcrumbSpy } = vi.hoisted(() => ({
  crewBreadcrumbSpy: vi.fn(),
}));

vi.mock("../utils/sentry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof sentryModule>();
  return {
    ...actual,
    emitCrewFailureBreadcrumb: (arg: Parameters<typeof actual.emitCrewFailureBreadcrumb>[0]) => {
      crewBreadcrumbSpy(arg);
      return actual.emitCrewFailureBreadcrumb(arg);
    },
  };
});

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
    delete process.env.CREW_AGENCY_API_KEY;
    // Reset the shared breadcrumb spy between tests so prior Crew failures don't
    // leak into later assertions.
    crewBreadcrumbSpy.mockClear();
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

  it("notifies Crew Agency when CREW_AGENCY_API_KEY is configured and score is low", async () => {
    process.env.CREW_AGENCY_API_KEY = "test_crew_api_key";

    // Build intentionally minimal/weak HTML so the engine produces a low score
    const weakHtml =
      "<!doctype html><html><head><title>Weak Page</title></head>" +
      "<body><div id='root'></div></body></html>";

    const crewPayloads: unknown[] = [];
    let crewRequests = 0;
    let crewAuthHeader = "";
    let crewApiKeyHeader = "";

    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      if (typeof url === "string" && url.includes("crew.tr4.net")) {
        crewRequests++;
        crewPayloads.push(JSON.parse(options.body));
        
        // Extract headers (handles both Headers object and plain object)
        if (options.headers && typeof options.headers.get === 'function') {
          crewAuthHeader = options.headers.get("Authorization") || "";
          crewApiKeyHeader = options.headers.get("X-API-Key") || "";
        } else if (options.headers) {
          crewAuthHeader = options.headers["Authorization"] || options.headers["authorization"] || "";
          crewApiKeyHeader = options.headers["X-API-Key"] || options.headers["x-api-key"] || "";
        }
        
        return { ok: true, status: 200, statusText: "OK", json: async () => ({ job_id: "test-uuid" }) };
      }
      // Cheerio fallback for the page fetch
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => weakHtml,
        json: async () => ({}),
        headers: { forEach: () => undefined },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    worker = startGeoWorker({ queueName });

    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-low", queueName, "queued", "https://example.com", "geo-test-corr-id-low"]
    );
    const jobIdInDb = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobIdInDb,
      url: "https://example.com",
    });

    const actualStatus = await waitForJobStatus(env.db, jobIdInDb);
    expect(actualStatus).toBe("completed");

    expect(crewRequests).toBe(1);
    expect(crewAuthHeader).toBe("Bearer test_crew_api_key");
    expect(crewApiKeyHeader).toBe("test_crew_api_key");
    expect(crewPayloads).toHaveLength(1);
    
    // Using string index signatures since TS complains without them
    const payload = crewPayloads[0] as Record<string, unknown>;
    expect(payload['url']).toBe("https://example.com");
    expect(payload['brand']).toBe("example.com");
    expect(typeof payload['score']).toBe("number");
    expect(payload['scoreBand']).toBeTruthy();
    expect(payload['lowScores']).toBeTruthy();
    expect(payload['topIssues']).toBeInstanceOf(Array);
    expect(typeof payload['proposalTrigger']).toBe("boolean");
    expect(payload['correlationId']).toBe("geo-test-corr-id-low");
    expect(payload['jobIdentity']).toBe("geo-test-job-identity-low");
    expect(payload['resultId']).toBeTruthy();
    expect(payload['analysisSummary']).toBeTruthy();
    // Test the fields added by Phase B
    expect(payload['matchedServices']).toBeInstanceOf(Array);
    expect(payload['tier']).toBe("free");

    // Crew Agency still consumes these legacy aliases alongside the complete
    // canonical payload. Keep this as one captured POST with no extra fields.
    expect(payload['musteri_ihtiyaci']).toBe(payload['analysisSummary']);
    expect(payload['brand_context']).toBe(payload['brand']);
    expect(payload['dil']).toBe("tr");
    expect(Object.keys(payload).sort()).toEqual([
      "analysisSummary",
      "brand",
      "brand_context",
      "correlationId",
      "dil",
      "jobIdentity",
      "lowScores",
      "matchedServices",
      "musteri_ihtiyaci",
      "proposalTrigger",
      "resultId",
      "score",
      "scoreBand",
      "tier",
      "topIssues",
      "url",
    ].sort());

    // Assert persistence happened before notify (since we wait for job completed status)
    const jobResults = await env.db.query("SELECT * FROM job_results WHERE correlation_id = $1", ["geo-test-corr-id-low"]);
    expect(jobResults.rows).toHaveLength(1);
    expect(jobResults.rows[0]?.id).toBe(payload['resultId']);
  });

  it("leaves job completed but audits Crew Agency errors via Breadcrumb (503/401/403 and fetch rejection)", async () => {
    process.env.CREW_AGENCY_API_KEY = "test_crew_api_key";

    const weakHtml =
      "<!doctype html><html><head><title>Weak Page</title></head>" +
      "<body><div id='root'></div></body></html>";

    let requestCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      if (typeof url === "string" && url.includes("crew.tr4.net")) {
        requestCount++;
        if (requestCount === 1) {
          return { ok: false, status: 503, statusText: "Service Unavailable" };
        } else if (requestCount === 2) {
          return { ok: false, status: 401, statusText: "Unauthorized" };
        } else if (requestCount === 3) {
          return { ok: false, status: 403, statusText: "Forbidden" };
        } else {
          return Promise.reject(new Error("Network Error"));
        }
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => weakHtml,
        json: async () => ({}),
        headers: { forEach: () => undefined },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    // Crew webhook failures are observed two ways: (1) console.error carries the
    // failure log, and (2) emitCrewFailureBreadcrumb records a breadcrumb. The
    // breadcrumb is spied via the top-level hoisted vi.mock (an in-test vi.mock
    // would be too late; spying on console.log doesn't intercept sentry.ts's
    // `import console from "node:console"` binding).
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    worker = startGeoWorker({ queueName });

    // Test 503
    const res1 = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-fail-1", queueName, "queued", "https://example.com/1", "geo-test-corr-id-fail-1"]
    );
    const jobId1 = res1.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobId1,
      url: "https://example.com/1",
    });

    const status1 = await waitForJobStatus(env.db, jobId1);
    expect(status1).toBe("completed");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Crew Agency notification failed:", 
      expect.objectContaining({ message: expect.stringContaining("503") })
    );

    let jobResults = await env.db.query("SELECT * FROM job_results WHERE correlation_id = $1", ["geo-test-corr-id-fail-1"]);
    expect(jobResults.rows).toHaveLength(1);
    const jobResult1 = await env.db.query("SELECT * FROM job_records WHERE id = $1", [jobId1]);
    expect(jobResult1.rows[0]?.completed_at).toBeTruthy();
    expect(jobResult1.rows[0]?.result_id).toBe(jobResults.rows[0]?.id);

    // Test Network Error
    // Fast-forward requestCount to map to the rejection path
    requestCount = 3; 
    
    const res2 = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-fail-2", queueName, "queued", "https://example.com/2", "geo-test-corr-id-fail-2"]
    );
    const jobId2 = res2.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobId2,
      url: "https://example.com/2",
    });

    const status2 = await waitForJobStatus(env.db, jobId2);
    expect(status2).toBe("completed");

    jobResults = await env.db.query("SELECT * FROM job_results WHERE correlation_id = $1", ["geo-test-corr-id-fail-2"]);
    expect(jobResults.rows).toHaveLength(1);
    
    expect(crewBreadcrumbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/2",
        jobId: String(jobId2),
        correlationId: "geo-test-corr-id-fail-2",
        errorMessage: "Network Error",
      }),
    );
  });

  it("aborts freezing fetch using AbortSignal without failing the job", async () => {
    process.env.CREW_AGENCY_API_KEY = "test_crew_api_key";

    const weakHtml =
      "<!doctype html><html><head><title>Weak Page</title></head>" +
      "<body><div id='root'></div></body></html>";

    const fetchMock = vi.fn().mockImplementation(async (url, options) => {
      if (typeof url === "string" && url.includes("crew.tr4.net")) {
        return new Promise((_, reject) => {
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new Error("The operation was aborted"));
            });
          }
          // Intentionally do not resolve to simulate a hang
        });
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => weakHtml,
        json: async () => ({}),
        headers: { forEach: () => undefined },
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    // Use a short, env-configured Crew webhook timeout with REAL timers so the
    // hanging fetch is aborted quickly. Fake timers + vi.advanceTimersByTime
    // corrupt BullMQ's internal heartbeats and hang worker.close() in afterEach,
    // so we drive the abort through the real, configurable production timeout.
    process.env.CREW_WEBHOOK_TIMEOUT_MS = "300";

    worker = startGeoWorker({ queueName });

    const res = await env.db.query(
      `INSERT INTO job_records (job_identity, queue_name, status, target, correlation_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ["geo-test-job-identity-timeout", queueName, "queued", "https://example.com/timeout", "geo-test-corr-id-timeout"]
    );
    const jobId = res.rows[0]?.id;

    await queue.add("geo_score", {
      jobId: jobId,
      url: "https://example.com/timeout",
    });

    const actualStatus = await waitForJobStatus(env.db, jobId);
    expect(actualStatus).toBe("completed");

    delete process.env.CREW_WEBHOOK_TIMEOUT_MS;
  });
});