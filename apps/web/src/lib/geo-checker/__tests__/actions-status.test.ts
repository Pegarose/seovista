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

import { checkJobStatusAction } from "../actions";

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
