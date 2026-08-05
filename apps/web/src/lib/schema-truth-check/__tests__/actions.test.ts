import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateSchemaTruthInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitSchemaTruthCheck, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitSchemaTruthCheck: vi.fn(),
  mockRedirect: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitSchemaTruthCheck: mockSubmitSchemaTruthCheck,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { startSchemaTruthCheckAction } from "../actions";

describe("validateSchemaTruthInput", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateSchemaTruthInput({ url: "https://example.com/" }).success).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(validateSchemaTruthInput({ url: "not-a-url" }).success).toBe(false);
  });
  it("rejects loopback targets", () => {
    expect(validateSchemaTruthInput({ url: "http://127.0.0.1/" }).success).toBe(false);
    expect(validateSchemaTruthInput({ url: "http://localhost/" }).success).toBe(false);
  });
  it("rejects private-network targets", () => {
    expect(validateSchemaTruthInput({ url: "http://192.168.1.1/" }).success).toBe(false);
    expect(validateSchemaTruthInput({ url: "http://10.0.0.5/" }).success).toBe(false);
  });
});

describe("startSchemaTruthCheckAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("happy path: redirects to /tools/schema-truth-check/result/<jobId>", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    const jobId = "11111111-2222-3333-4444-555555555555";
    mockSubmitSchemaTruthCheck.mockResolvedValue({ jobId });
    mockRedirect.mockImplementation((path: string) => {
      const err = new Error(`NEXT_REDIRECT ${path}`) as Error & { digest: string };
      err.digest = `NEXT_REDIRECT;${path}`;
      throw err;
    });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    await expect(
      startSchemaTruthCheckAction({ status: "idle" }, formData),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockRedirect).toHaveBeenCalledWith(`/tools/schema-truth-check/result/${jobId}`);
    expect(mockSubmitSchemaTruthCheck).toHaveBeenCalledOnce();
  });

  it("database-missing guard: returns system-error contract when getAdminDb throws", async () => {
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    const result = await startSchemaTruthCheckAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitSchemaTruthCheck).not.toHaveBeenCalled();
  });

  it("rate-limit rejection: returns error and does not submit", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: false });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    const result = await startSchemaTruthCheckAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toMatch(/Saatlik audit limitine/);
    expect(mockSubmitSchemaTruthCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("zod-validation failure: empty FormData produces error with field errors", async () => {
    const formData = new FormData();

    const result = await startSchemaTruthCheckAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors && Object.keys(result.errors).length).toBeGreaterThan(0);
    expect(mockSubmitSchemaTruthCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
  });
});
