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
  it.each(["queued", "running", "pending", "completed", "failed", "timeout", "permanent", "permanent_failure"] as const)(
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
          status,
          persistedStatus: status,
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
        persistedStatus: "mysterious_status",
      },
    });
  });
});
