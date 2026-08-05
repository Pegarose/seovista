import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateAttributionTraceInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitAttributionTraceCheck, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitAttributionTraceCheck: vi.fn(),
  mockRedirect: vi.fn(),
  mockHeaders: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitAttributionTraceCheck: mockSubmitAttributionTraceCheck,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { startAttributionTraceAction } from "../actions";

describe("validateAttributionTraceInput", () => {
  it("accepts valid domain + >=40-char answer", () => {
    const result = validateAttributionTraceInput({
      domain: "example.com",
      answer: "The site example.com is a Turkish e-commerce platform founded in 2000 with thousands of employees.",
    });
    expect(result.success).toBe(true);
  });
  it("rejects invalid domain", () => {
    const result = validateAttributionTraceInput({
      domain: "not a domain",
      answer: "The site example.com is a Turkish e-commerce platform founded in 2000.",
    });
    expect(result.success).toBe(false);
  });
  it("rejects answer shorter than 40 chars", () => {
    const result = validateAttributionTraceInput({
      domain: "example.com",
      answer: "too short",
    });
    expect(result.success).toBe(false);
  });
});

describe("startAttributionTraceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHeaders.mockResolvedValue(new Headers());
  });

  it("happy path: redirects to /tools/attribution-trace/result/<jobId>", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    const jobId = "99999999-8888-7777-6666-555555555555";
    mockSubmitAttributionTraceCheck.mockResolvedValue({ jobId });
    mockRedirect.mockImplementation((path: string) => {
      const err = new Error(`NEXT_REDIRECT ${path}`) as Error & { digest: string };
      err.digest = `NEXT_REDIRECT;${path}`;
      throw err;
    });

    const formData = new FormData();
    formData.set("domain", "example.com");
    formData.set(
      "answer",
      "The site example.com is a Turkish e-commerce platform founded in 2000 with thousands of employees.",
    );
    formData.set("keyword", "online shopping");

    await expect(
      startAttributionTraceAction({ status: "idle" }, formData),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(mockRedirect).toHaveBeenCalledWith(`/tools/attribution-trace/result/${jobId}`);
    expect(mockSubmitAttributionTraceCheck).toHaveBeenCalledOnce();
  });

  it("database-missing guard: returns system-error contract when getAdminDb throws", async () => {
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const formData = new FormData();
    formData.set("domain", "example.com");
    formData.set(
      "answer",
      "The site example.com is a Turkish e-commerce platform founded in 2000 with thousands of employees.",
    );

    const result = await startAttributionTraceAction({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitAttributionTraceCheck).not.toHaveBeenCalled();
  });

  it("rate-limit rejection: returns error and does not submit", async () => {
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: false });

    const formData = new FormData();
    formData.set("domain", "example.com");
    formData.set(
      "answer",
      "The site example.com is a Turkish e-commerce platform founded in 2000 with thousands of employees.",
    );

    const result = await startAttributionTraceAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toMatch(/Saatlik audit limitine/);
    expect(mockSubmitAttributionTraceCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("zod-validation failure: empty FormData produces error with field errors", async () => {
    const formData = new FormData();

    const result = await startAttributionTraceAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(result.errors && Object.keys(result.errors).length).toBeGreaterThan(0);
    expect(mockSubmitAttributionTraceCheck).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
  });
});
