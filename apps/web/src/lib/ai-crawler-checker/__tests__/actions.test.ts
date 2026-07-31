import { describe, expect, it, vi } from "vitest";
import { validateAiCrawlerInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitAiCrawlerAudit } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitAiCrawlerAudit: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitAiCrawlerAudit: mockSubmitAiCrawlerAudit,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { startAiCrawlerAuditAction } from "../actions";

describe("validateAiCrawlerInput", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateAiCrawlerInput("https://example.com").success).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(validateAiCrawlerInput("not-a-url").success).toBe(false);
  });
  it("rejects metadata and loopback targets", () => {
    expect(validateAiCrawlerInput("http://169.254.169.254/").success).toBe(false);
    expect(validateAiCrawlerInput("http://127.0.0.2/").success).toBe(false);
    expect(validateAiCrawlerInput("http://[::1]/").success).toBe(false);
  });
  it("rejects non-http protocols", () => {
    expect(validateAiCrawlerInput("file:///etc/passwd").success).toBe(false);
  });
});

describe("startAiCrawlerAuditAction admin db guard (B3)", () => {
  it("returns the existing system-error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("url", "https://example.com");

    const result = await startAiCrawlerAuditAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitAiCrawlerAudit).not.toHaveBeenCalled();
  });
});
