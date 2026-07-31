import { describe, expect, it, vi } from "vitest";

const { mockGetAdminDb, mockCreateRepository } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCreateRepository: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  createGeoAuditRepository: mockCreateRepository,
  submitGeoAudit: vi.fn(),
  checkIpRateLimit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { checkJobStatusAction, startGeoAuditAction, unlockDetailedReport } from "../actions";

describe("checkJobStatusAction status contract", () => {
  it.each(["queued", "running", "completed", "failed", "timeout", "permanent"] as const)(
    "preserves supported persisted status %s",
    async (status) => {
      const getJobRecord = vi.fn().mockResolvedValue({
        status,
        lead_id: "lead-1",
        work_email: null,
      });
      mockGetAdminDb.mockReturnValue({});
      mockCreateRepository.mockReturnValue({ getJobRecord });

      const result = await checkJobStatusAction("00000000-0000-0000-0000-000000000001");

      expect(result).toEqual({
        success: true,
        data: {
          status: status,
        },
      });
    },
  );

  it("maps an unknown persisted status to the explicit unknown response state", async () => {
    const getJobRecord = vi.fn().mockResolvedValue({
      status: "mysterious_status",
      lead_id: "lead-1",
      work_email: null,
    });
    mockGetAdminDb.mockReturnValue({});
    mockCreateRepository.mockReturnValue({ getJobRecord });

    const result = await checkJobStatusAction("00000000-0000-0000-0000-000000000001");

    expect(result).toEqual({
      success: true,
      data: {
        status: "unknown",
      },
    });
  });
  
  it("rejects malformed UUID before hitting db", async () => {
    mockGetAdminDb.mockClear();
    mockCreateRepository.mockClear();
    const result = await checkJobStatusAction("not-a-uuid");
    expect(mockGetAdminDb).not.toHaveBeenCalled();
    expect(mockCreateRepository).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
  
  it("returns null data for missing job", async () => {
    const getJobRecord = vi.fn().mockResolvedValue(undefined);
    mockGetAdminDb.mockReturnValue({});
    mockCreateRepository.mockReturnValue({ getJobRecord });

    const result = await checkJobStatusAction("00000000-0000-0000-0000-000000000001");

    expect(result).toEqual({
      success: true,
      data: null,
    });
  });
});

describe("geo actions admin db guard (B3)", () => {
  it("checkJobStatusAction returns the failure contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const result = await checkJobStatusAction("00000000-0000-0000-0000-000000000001");

    expect(result).toEqual({ success: false, error: "Failed to check job status" });
  });

  it("startGeoAuditAction returns the form-error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateRepository.mockClear();
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("domain", "https://example.com");
    formData.set("brandName", "Example Brand");
    formData.set("primaryMarket", "TR");

    const result = await startGeoAuditAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Failed to start audit due to a system error. Please try again later."],
      },
    });
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it("unlockDetailedReport returns the error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("jobId", "00000000-0000-0000-0000-000000000001");
    formData.set("leadId", "00000000-0000-0000-0000-000000000002");
    formData.set("email", "user@example.com");
    formData.set("consent", "true");

    const result = await unlockDetailedReport({}, formData);

    expect(result).toEqual({ error: "Failed to update lead information. Please try again." });
  });
});
