import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateRenderParityInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitRenderParityCheck, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitRenderParityCheck: vi.fn(),
  mockRedirect: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitRenderParityCheck: mockSubmitRenderParityCheck,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { startRenderParityCheckAction } from "../actions";

describe("validateRenderParityInput", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateRenderParityInput({ url: "https://example.com/" }).success).toBe(true);
  });
  it("rejects invalid URLs", () => {
    expect(validateRenderParityInput({ url: "not-a-url" }).success).toBe(false);
  });
  it("rejects loopback targets", () => {
    expect(validateRenderParityInput({ url: "http://127.0.0.1/" }).success).toBe(false);
    expect(validateRenderParityInput({ url: "http://localhost/" }).success).toBe(false);
  });
  it("rejects private-network targets", () => {
    expect(validateRenderParityInput({ url: "http://192.168.1.1/" }).success).toBe(false);
    expect(validateRenderParityInput({ url: "http://10.0.0.5/" }).success).toBe(false);
  });
});

describe("startRenderParityCheckAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("happy path: redirects to /tools/render-parity-diff/result/<jobId>", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    const jobId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    mockSubmitRenderParityCheck.mockResolvedValue({ jobId });
    mockRedirect.mockImplementation((path: string) => {
      const err = new Error(`NEXT_REDIRECT ${path}`) as Error & { digest: string };
      err.digest = `NEXT_REDIRECT;${path}`;
      throw err;
    });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    await expect(
      startRenderParityCheckAction({ status: "idle" }, formData),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockRedirect).toHaveBeenCalledWith(`/tools/render-parity-diff/result/${jobId}`);
    expect(mockSubmitRenderParityCheck).toHaveBeenCalledOnce();
  });

  it("database-missing guard: returns system-error contract when getAdminDb throws", async () => {
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    const result = await startRenderParityCheckAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitRenderParityCheck).not.toHaveBeenCalled();
  });

  it("rate-limit rejection: returns error and does not submit", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: false });

    const formData = new FormData();
    formData.set("url", "https://example.com/");

    const result = await startRenderParityCheckAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toMatch(/Saatlik audit limitine/);
    expect(mockSubmitRenderParityCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("zod-validation failure: empty FormData produces error with field errors", async () => {
    const formData = new FormData();

    const result = await startRenderParityCheckAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors && Object.keys(result.errors).length).toBeGreaterThan(0);
    expect(mockSubmitRenderParityCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
  });
});
