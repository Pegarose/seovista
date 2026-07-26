import { describe, it, expect, vi } from "vitest";
import type { CrewAgencyPayload } from "../queue/crew-queue.js";
import { processCrewNotification } from "../queue/crew-queue.js";

describe("Crew Async Queue & Retry Mechanism", () => {
  const samplePayload: CrewAgencyPayload = {
    url: "https://example.com",
    brand: "example.com",
    score: 45,
    scoreBand: "poor",
    lowScores: { access: 40, understanding: 50, evidence: 45 },
    topIssues: [{ code: "META_MISSING", title: "Meta missing", severity: "high" }],
    proposalTrigger: true,
    correlationId: "corr-123",
    jobIdentity: "job-123",
    resultId: "res-123",
    analysisSummary: "SeoVista GEO analysis completed",
    matchedServices: ["GEO Audit"],
    tier: "tier1",
  };

  it("successfully processes crew notification payload when fetch succeeds", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "crew-job-999" }),
    });

    const result = await processCrewNotification(samplePayload, {
      fetch: mockFetch as unknown as typeof fetch,
      apiKey: "test-api-key",
      apiUrl: "https://crew.tr4.net/api",
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toBe("crew-job-999");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws retryable error when fetch returns non-200 status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    await expect(
      processCrewNotification(samplePayload, {
        fetch: mockFetch as unknown as typeof fetch,
        apiKey: "test-api-key",
        apiUrl: "https://crew.tr4.net/api",
      })
    ).rejects.toThrow("Crew Agency notification failed: 503 Service Unavailable");
  });

  it("returns skipped result when API key is missing", async () => {
    const mockFetch = vi.fn();
    const result = await processCrewNotification(samplePayload, {
      fetch: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
