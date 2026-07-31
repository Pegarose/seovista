import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateKeywordRankInput } from "../validation";

const { mockGetAdminDb, mockCheckIpRateLimit, mockSubmitKeywordRankCheck, mockRedirect, mockHeaders } =
  vi.hoisted(() => ({
    mockGetAdminDb: vi.fn(),
    mockCheckIpRateLimit: vi.fn(),
    mockSubmitKeywordRankCheck: vi.fn(),
    mockRedirect: vi.fn(),
    mockHeaders: vi.fn(),
  }));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitKeywordRankCheck: mockSubmitKeywordRankCheck,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { startKeywordRankCheckAction } from "../actions";

const VALID_INPUT = {
  domain: "example.com",
  keyword: "seo denetimi",
  locale: "tr-TR",
};

function buildFormData(input: { domain: string; keyword: string; locale: string }): FormData {
  const formData = new FormData();
  formData.set("domain", input.domain);
  formData.set("keyword", input.keyword);
  formData.set("locale", input.locale);
  return formData;
}

describe("validateKeywordRankInput", () => {
  it("accepts a valid domain, keyword and locale", () => {
    const result = validateKeywordRankInput(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID_INPUT);
    }
  });

  it("trims domain and keyword whitespace", () => {
    const result = validateKeywordRankInput({
      domain: "  example.com  ",
      keyword: "  seo denetimi  ",
      locale: "en-US",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domain).toBe("example.com");
      expect(result.data.keyword).toBe("seo denetimi");
    }
  });

  it.each(["127.0.0.1", "nodot"])("rejects invalid domain %s", (domain) => {
    const result = validateKeywordRankInput({ ...VALID_INPUT, domain });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.domain?.length).toBeGreaterThan(0);
    }
  });

  it("rejects an empty keyword", () => {
    const result = validateKeywordRankInput({ ...VALID_INPUT, keyword: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.keyword?.length).toBeGreaterThan(0);
    }
  });

  it("rejects a keyword longer than 120 characters", () => {
    const result = validateKeywordRankInput({ ...VALID_INPUT, keyword: "x".repeat(121) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.keyword?.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unsupported locale", () => {
    const result = validateKeywordRankInput({ ...VALID_INPUT, locale: "de-DE" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.locale?.length).toBeGreaterThan(0);
    }
  });
});

describe("startKeywordRankCheckAction", () => {
  let savedRedisUrl: string | undefined;
  let savedRateLimit: string | undefined;

  beforeEach(() => {
    savedRedisUrl = process.env.REDIS_URL;
    savedRateLimit = process.env.AUDIT_PER_IP_RATE_LIMIT;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
    if (savedRateLimit === undefined) delete process.env.AUDIT_PER_IP_RATE_LIMIT;
    else process.env.AUDIT_PER_IP_RATE_LIMIT = savedRateLimit;
    vi.restoreAllMocks();
  });

  it.each(["127.0.0.1", "nodot"])("returns errors.domain for invalid domain %s", async (domain) => {
    const result = await startKeywordRankCheckAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, domain })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.domain?.length).toBeGreaterThan(0);
    expect(mockGetAdminDb).not.toHaveBeenCalled();
    expect(mockSubmitKeywordRankCheck).not.toHaveBeenCalled();
  });

  it.each([
    ["", "empty"],
    ["x".repeat(121), "longer than 120 characters"],
  ])("returns errors.keyword for a %s keyword", async (keyword) => {
    const result = await startKeywordRankCheckAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, keyword })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.keyword?.length).toBeGreaterThan(0);
    expect(mockSubmitKeywordRankCheck).not.toHaveBeenCalled();
  });

  it("returns errors.locale for an unsupported locale", async () => {
    const result = await startKeywordRankCheckAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, locale: "de-DE" })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.locale?.length).toBeGreaterThan(0);
    expect(mockSubmitKeywordRankCheck).not.toHaveBeenCalled();
  });

  it("returns the Turkish hourly rate-limit form error when the IP limit is exceeded", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    delete process.env.AUDIT_PER_IP_RATE_LIMIT;
    mockGetAdminDb.mockReturnValue({});
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: false });

    const result = await startKeywordRankCheckAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Saatlik audit limitine (10) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith({
      redisUrl: "redis://localhost:8637",
      ip: "203.0.113.10",
      limit: 10,
    });
    expect(mockSubmitKeywordRankCheck).not.toHaveBeenCalled();
  });

  it("submits the check and rethrows NEXT_REDIRECT to the result page", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    const fakeDb = { query: vi.fn() };
    mockGetAdminDb.mockReturnValue(fakeDb);
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockSubmitKeywordRankCheck.mockResolvedValue({
      jobId: "00000000-0000-0000-0000-000000000001",
    });
    mockRedirect.mockImplementation((url: string) => {
      const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
      error.digest = `NEXT_REDIRECT;replace;${url};307;`;
      throw error;
    });

    await expect(
      startKeywordRankCheckAction({ status: "idle" }, buildFormData(VALID_INPUT))
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });

    expect(mockSubmitKeywordRankCheck).toHaveBeenCalledWith({
      db: fakeDb,
      redisUrl: "redis://localhost:8637",
      domain: "example.com",
      keyword: "seo denetimi",
      locale: "tr-TR",
    });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/tools/keyword-rank-checker/result/00000000-0000-0000-0000-000000000001"
    );
  });

  it("returns the system-error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const result = await startKeywordRankCheckAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle denetim başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitKeywordRankCheck).not.toHaveBeenCalled();
  });
});
