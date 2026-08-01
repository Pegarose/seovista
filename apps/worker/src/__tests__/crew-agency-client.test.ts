import { describe, expect, it, vi } from "vitest";

import {
  CrewAgencyClient,
  CrewAgencyError,
  resolveCrewAgencyClient,
} from "../utils/crew-agency-client";

const BASE_URL = "https://crew.example.com";
const API_KEY = "test-api-key";

function jsonResponse(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null, // triggers the text() fallback in readBodyWithCap
    text: async () => JSON.stringify(body),
  };
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return new CrewAgencyClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    fetchImpl: fetchMock as never,
  });
}

describe("CrewAgencyClient constructor", () => {
  it("rejects non-http(s) base URLs as crew.misconfigured", () => {
    expect(() => new CrewAgencyClient({ baseUrl: "ftp://crew.example.com", apiKey: API_KEY })).toThrowError(
      CrewAgencyError,
    );
    try {
      new CrewAgencyClient({ baseUrl: "ftp://crew.example.com", apiKey: API_KEY });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CrewAgencyError);
      expect((error as CrewAgencyError).code).toBe("crew.misconfigured");
      expect((error as CrewAgencyError).retryable).toBe(false);
    }
  });

  it("rejects unparseable base URLs as crew.misconfigured", () => {
    expect(() => new CrewAgencyClient({ baseUrl: "not a url", apiKey: API_KEY })).toThrowError(
      CrewAgencyError,
    );
  });

  it("rejects an empty or blank API key as crew.misconfigured", () => {
    for (const apiKey of ["", "   "]) {
      try {
        new CrewAgencyClient({ baseUrl: BASE_URL, apiKey });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CrewAgencyError);
        expect((error as CrewAgencyError).code).toBe("crew.misconfigured");
        expect((error as CrewAgencyError).retryable).toBe(false);
      }
    }
  });
});

describe("CrewAgencyClient.kickoff", () => {
  it("POSTs the JSON body with the X-API-Key header and accepts { job_id }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ job_id: "job-123" }));
    const client = makeClient(fetchMock);

    const result = await client.kickoff("/api/rapor-uret", { brand_context: "example.com", dil: "tr" });

    expect(result).toEqual({ jobId: "job-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/rapor-uret`);
    expect(requestInit.method).toBe("POST");
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe(API_KEY);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(requestInit.body).toBe(JSON.stringify({ brand_context: "example.com", dil: "tr" }));
  });

  it("accepts a { jobId } response shape as well", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ jobId: "job-456" }));
    const client = makeClient(fetchMock);

    await expect(client.kickoff("/api/seo-brief", { konu: "seo", brand_context: "example.com", dil: "tr" }))
      .resolves.toEqual({ jobId: "job-456" });
  });

  it("maps a JSON response without a job id string to crew.unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const client = makeClient(fetchMock);

    await expect(client.kickoff("/api/rapor-uret", {})).rejects.toMatchObject({
      code: "crew.unavailable",
      retryable: true,
    });
  });

  it.each([
    [401, "crew.auth", false],
    [403, "crew.auth", false],
    [429, "crew.rate_limited", true],
    // Contract violations (e.g. a missing required body field) are permanent:
    // retrying the identical request can never succeed.
    [400, "crew.client_error", false],
    [404, "crew.client_error", false],
    [422, "crew.client_error", false],
    [503, "crew.unavailable", true],
    [500, "crew.unavailable", true],
  ] as const)("maps HTTP %i to %s (retryable=%s)", async (status, code, retryable) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, { status }));
    const client = makeClient(fetchMock);

    await expect(client.kickoff("/api/rapor-uret", {})).rejects.toMatchObject({ code, retryable });
  });

  it("maps an aborted/timed-out request to crew.timeout (retryable)", async () => {
    const timeoutError = new Error("The operation timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);
    const client = makeClient(fetchMock);

    await expect(client.kickoff("/api/rapor-uret", {})).rejects.toMatchObject({
      code: "crew.timeout",
      retryable: true,
    });
  });

  it("maps network failures to crew.unavailable (retryable)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const client = makeClient(fetchMock);

    await expect(client.kickoff("/api/rapor-uret", {})).rejects.toMatchObject({
      code: "crew.unavailable",
      retryable: true,
    });
  });
});

describe("CrewAgencyClient.getJob", () => {
  it("GETs /api/jobs/{id} with the X-API-Key header and parses a completed job", async () => {
    const report = { markdown: "# Rapor" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "completed", result: report }));
    const client = makeClient(fetchMock);

    const job = await client.getJob("job-123");

    expect(job).toEqual({ status: "completed", result: report });
    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/jobs/job-123`);
    expect(requestInit.method).toBe("GET");
    expect((requestInit.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("parses a failed job with its error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: "failed", error: "agent crashed" }));
    const client = makeClient(fetchMock);

    await expect(client.getJob("job-123")).resolves.toEqual({ status: "failed", error: "agent crashed" });
  });

  it("passes in-flight and unknown status strings through as-is", async () => {
    for (const status of ["queued", "running", "waiting_for_agent", "something-new"]) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status }));
      const client = makeClient(fetchMock);

      const job = await client.getJob("job-123");
      expect(job.status).toBe(status);
      expect(job.result).toBeUndefined();
      expect(job.error).toBeUndefined();
    }
  });

  it("maps non-OK responses to the same typed error taxonomy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = makeClient(fetchMock);

    await expect(client.getJob("job-123")).rejects.toMatchObject({ code: "crew.auth", retryable: false });
  });
});

describe("resolveCrewAgencyClient", () => {
  it("returns null when either env var is missing", () => {
    expect(resolveCrewAgencyClient({})).toBeNull();
    expect(resolveCrewAgencyClient({ CREW_AGENCY_API_URL: BASE_URL })).toBeNull();
    expect(resolveCrewAgencyClient({ CREW_AGENCY_API_KEY: API_KEY })).toBeNull();
    expect(resolveCrewAgencyClient({ CREW_AGENCY_API_URL: "  ", CREW_AGENCY_API_KEY: API_KEY })).toBeNull();
  });

  it("returns a configured client when both env vars are set", () => {
    const client = resolveCrewAgencyClient({
      CREW_AGENCY_API_URL: BASE_URL,
      CREW_AGENCY_API_KEY: API_KEY,
    });

    expect(client).toBeInstanceOf(CrewAgencyClient);
  });
});
