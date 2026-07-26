import { describe, it, expect, vi } from "vitest";
import {
  enqueueScheduledAudit,
  processScheduledAuditCheck,
  ScheduledAuditPayload,
} from "../queue/scheduled-monitor.js";

describe("Scheduled Recrawl & Continuous Monitoring", () => {
  const samplePayload: ScheduledAuditPayload = {
    url: "https://example.com",
    frequency: "daily",
    tenantId: "tenant-123",
    siteId: "site-123",
    lastAuditedAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
  };

  it("identifies URL due for recrawl based on frequency and lastAuditedAt", () => {
    const isDue = processScheduledAuditCheck(samplePayload);
    expect(isDue).toBe(true);
  });

  it("identifies URL not due for recrawl if audited recently", () => {
    const recentlyAudited: ScheduledAuditPayload = {
      ...samplePayload,
      lastAuditedAt: new Date().toISOString(),
    };

    const isDue = processScheduledAuditCheck(recentlyAudited);
    expect(isDue).toBe(false);
  });

  it("enqueues recrawl job with forceAudit=false to leverage cache when valid", async () => {
    const mockAddJob = vi.fn().mockResolvedValue({ id: "job-recrawl-123" });
    const mockQueue = {
      add: mockAddJob,
    };

    const result = await enqueueScheduledAudit(mockQueue as any, samplePayload);

    expect(result.jobId).toBe("job-recrawl-123");
    expect(mockAddJob).toHaveBeenCalledWith(
      "scheduled-recrawl",
      expect.objectContaining({
        url: "https://example.com",
        forceAudit: false,
        isRecrawl: true,
      }),
      expect.anything()
    );
  });
});
