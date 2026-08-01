import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCrewReportInput } from "../validation";

const {
  mockGetAdminDb,
  mockCheckIpRateLimit,
  mockSubmitCrewReport,
  mockCreateGeoAuditRepository,
  mockHeaders,
  mockGetJobRecord,
  mockCreateLead,
  mockUpdateLeadEmailForJob,
} = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockSubmitCrewReport: vi.fn(),
  mockCreateGeoAuditRepository: vi.fn(),
  mockHeaders: vi.fn(),
  mockGetJobRecord: vi.fn(),
  mockCreateLead: vi.fn(),
  mockUpdateLeadEmailForJob: vi.fn(),
}));

vi.mock("../../admin/db", () => ({
  getAdminDb: mockGetAdminDb,
}));

vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  submitCrewReport: mockSubmitCrewReport,
  createGeoAuditRepository: mockCreateGeoAuditRepository,
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

import { checkCrewReportStatusAction, startCrewReportAction } from "../actions";

const SOURCE_JOB_ID = "11111111-2222-4333-8444-555555555555";
const CREW_JOB_ID = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "99999999-8888-4777-8666-555555555555";

const VALID_INPUT = {
  sourceJobId: SOURCE_JOB_ID,
  tool: "geo-readiness",
  email: "kullanici@example.com",
  consent: true,
};

function buildFormData(input: {
  sourceJobId: string;
  tool: string;
  email: string;
  consent: boolean;
}): FormData {
  const formData = new FormData();
  formData.set("sourceJobId", input.sourceJobId);
  formData.set("tool", input.tool);
  formData.set("email", input.email);
  if (input.consent) {
    formData.set("consent", "true");
  }
  return formData;
}

describe("validateCrewReportInput", () => {
  it("accepts a valid source job id, tool, email and consent", () => {
    const result = validateCrewReportInput(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(VALID_INPUT);
    }
  });

  it.each(["geo-readiness", "schema", "ai-crawler", "keyword-rank"])(
    "accepts the %s tool",
    (tool) => {
      const result = validateCrewReportInput({ ...VALID_INPUT, tool });
      expect(result.success).toBe(true);
    }
  );

  it("trims email whitespace", () => {
    const result = validateCrewReportInput({ ...VALID_INPUT, email: "  kullanici@example.com  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("kullanici@example.com");
    }
  });

  it("rejects an invalid email with the Turkish message", () => {
    const result = validateCrewReportInput({ ...VALID_INPUT, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toContain("Geçerli bir e-posta giriniz.");
    }
  });

  it("rejects missing consent with the Turkish message", () => {
    const result = validateCrewReportInput({ ...VALID_INPUT, consent: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.consent).toContain(
        "Devam etmek için onay gereklidir."
      );
    }
  });

  it("rejects a non-UUID source job id", () => {
    const result = validateCrewReportInput({ ...VALID_INPUT, sourceJobId: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.sourceJobId?.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown tool", () => {
    const result = validateCrewReportInput({ ...VALID_INPUT, tool: "unknown-tool" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.tool?.length).toBeGreaterThan(0);
    }
  });
});

describe("startCrewReportAction", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      REDIS_URL: process.env.REDIS_URL,
      CREW_REPORT_PER_IP_RATE_LIMIT: process.env.CREW_REPORT_PER_IP_RATE_LIMIT,
      CREW_AGENCY_API_URL: process.env.CREW_AGENCY_API_URL,
      CREW_AGENCY_API_KEY: process.env.CREW_AGENCY_API_KEY,
    };
    vi.clearAllMocks();
    process.env.CREW_AGENCY_API_URL = "https://crew.example.com";
    process.env.CREW_AGENCY_API_KEY = "test-key";
    mockCreateGeoAuditRepository.mockReturnValue({
      getJobRecord: mockGetJobRecord,
      createLead: mockCreateLead,
      updateLeadEmailForJob: mockUpdateLeadEmailForJob,
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("returns errors.email for an invalid email and does not touch the worker boundary", async () => {
    const result = await startCrewReportAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, email: "not-an-email" })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.email).toContain("Geçerli bir e-posta giriniz.");
    expect(mockGetAdminDb).not.toHaveBeenCalled();
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it("returns errors.consent when consent is missing", async () => {
    const result = await startCrewReportAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, consent: false })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.consent).toContain("Devam etmek için onay gereklidir.");
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it("returns errors.sourceJobId for a malformed job id", async () => {
    const result = await startCrewReportAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, sourceJobId: "not-a-uuid" })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.sourceJobId?.length).toBeGreaterThan(0);
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it("returns errors.tool for an unknown tool", async () => {
    const result = await startCrewReportAction(
      { status: "idle" },
      buildFormData({ ...VALID_INPUT, tool: "unknown-tool" })
    );

    expect(result.status).toBe("error");
    expect(result.errors?.tool?.length).toBeGreaterThan(0);
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it.each(["CREW_AGENCY_API_URL", "CREW_AGENCY_API_KEY"])(
    "returns the honest not-configured error when %s is unset (before any rate limit or submit)",
    async (envKey) => {
      delete process.env[envKey];

      const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

      expect(result).toEqual({
        status: "error",
        errors: {
          form: ["AI strateji raporu servisi henüz yapılandırılmadı."],
        },
      });
      expect(mockGetAdminDb).not.toHaveBeenCalled();
      expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
      expect(mockSubmitCrewReport).not.toHaveBeenCalled();
    }
  );

  it("returns the Turkish rate-limit form error when the crew-report bucket is exceeded", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    delete process.env.CREW_REPORT_PER_IP_RATE_LIMIT;
    mockGetAdminDb.mockReturnValue({});
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: false });

    const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Saatlik rapor limitine (5) ulaştınız. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).toHaveBeenCalledWith({
      redisUrl: "redis://localhost:8637",
      ip: "203.0.113.10",
      limit: 5,
      bucket: "crew-report",
    });
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it.each(["queued", "running", "failed", "timeout"])(
    "rejects when the source job status is %s",
    async (status) => {
      process.env.REDIS_URL = "redis://localhost:8637";
      const fakeDb = { query: vi.fn() };
      mockGetAdminDb.mockReturnValue(fakeDb);
      mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
      mockCheckIpRateLimit.mockResolvedValue({ success: true });
      mockGetJobRecord.mockResolvedValue({ status, lead_id: null, work_email: null });

      const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

      expect(result.status).toBe("error");
      expect(result.errors?.form?.length).toBeGreaterThan(0);
      expect(mockCreateLead).not.toHaveBeenCalled();
      expect(mockSubmitCrewReport).not.toHaveBeenCalled();
    }
  );

  it("rejects when the source job does not exist", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    const fakeDb = { query: vi.fn() };
    mockGetAdminDb.mockReturnValue(fakeDb);
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockGetJobRecord.mockResolvedValue(undefined);

    const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result.status).toBe("error");
    expect(result.errors?.form?.length).toBeGreaterThan(0);
    expect(mockCreateLead).not.toHaveBeenCalled();
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });

  it("creates the lead, submits the crew report and updates the lead email in order", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    const fakeDb = {
      query: vi.fn().mockResolvedValue({ rows: [{ target: "https://example.com" }] }),
    };
    mockGetAdminDb.mockReturnValue(fakeDb);
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockGetJobRecord.mockResolvedValue({ status: "completed", lead_id: null, work_email: null });
    mockCreateLead.mockResolvedValue({ id: LEAD_ID });
    mockSubmitCrewReport.mockResolvedValue({ jobId: CREW_JOB_ID });
    mockUpdateLeadEmailForJob.mockResolvedValue({ id: LEAD_ID });

    const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({ status: "started", crewJobId: CREW_JOB_ID });
    expect(mockCreateLead).toHaveBeenCalledWith({
      domain: "https://example.com",
      brandName: "SeoVista Tools",
      primaryMarket: "tr",
    });
    expect(mockSubmitCrewReport).toHaveBeenCalledWith({
      db: fakeDb,
      redisUrl: "redis://localhost:8637",
      sourceJobId: SOURCE_JOB_ID,
      tool: "geo-readiness",
    });
    expect(mockUpdateLeadEmailForJob).toHaveBeenCalledWith(
      CREW_JOB_ID,
      LEAD_ID,
      "kullanici@example.com",
      true
    );

    const createOrder = mockCreateLead.mock.invocationCallOrder[0]!;
    const submitOrder = mockSubmitCrewReport.mock.invocationCallOrder[0]!;
    const updateOrder = mockUpdateLeadEmailForJob.mock.invocationCallOrder[0]!;
    expect(createOrder).toBeLessThan(submitOrder);
    expect(submitOrder).toBeLessThan(updateOrder);
  });

  it("falls back to the unknown domain when the source job carries no target", async () => {
    process.env.REDIS_URL = "redis://localhost:8637";
    const fakeDb = { query: vi.fn().mockResolvedValue({ rows: [{ target: null }] }) };
    mockGetAdminDb.mockReturnValue(fakeDb);
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockGetJobRecord.mockResolvedValue({ status: "completed", lead_id: null, work_email: null });
    mockCreateLead.mockResolvedValue({ id: LEAD_ID });
    mockSubmitCrewReport.mockResolvedValue({ jobId: CREW_JOB_ID });
    mockUpdateLeadEmailForJob.mockResolvedValue({ id: LEAD_ID });

    const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({ status: "started", crewJobId: CREW_JOB_ID });
    expect(mockCreateLead).toHaveBeenCalledWith({
      domain: "unknown",
      brandName: "SeoVista Tools",
      primaryMarket: "tr",
    });
  });

  it("returns the system-error contract when DATABASE_URL is missing (getAdminDb throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const result = await startCrewReportAction({ status: "idle" }, buildFormData(VALID_INPUT));

    expect(result).toEqual({
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle rapor başlatılamadı. Lütfen daha sonra tekrar deneyiniz."],
      },
    });
    expect(mockCheckIpRateLimit).not.toHaveBeenCalled();
    expect(mockSubmitCrewReport).not.toHaveBeenCalled();
  });
});

describe("checkCrewReportStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an invalid job id format", async () => {
    const result = await checkCrewReportStatusAction("not-a-uuid");

    expect(result).toEqual({ success: false, error: "Invalid job ID format" });
    expect(mockGetAdminDb).not.toHaveBeenCalled();
  });

  it("returns null data when the crew report job does not exist", async () => {
    const fakeDb = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockGetAdminDb.mockReturnValue(fakeDb);

    const result = await checkCrewReportStatusAction(CREW_JOB_ID);

    expect(result).toEqual({ success: true, data: null });
    expect(fakeDb.query.mock.calls[0]![0]).toContain("crew_report");
  });

  it("returns the in-flight status without a report payload", async () => {
    const fakeDb = {
      query: vi.fn().mockResolvedValue({ rows: [{ status: "running", result_payload: null }] }),
    };
    mockGetAdminDb.mockReturnValue(fakeDb);

    const result = await checkCrewReportStatusAction(CREW_JOB_ID);

    expect(result).toEqual({ success: true, data: { status: "running" } });
  });

  it("returns the parsed crew-report payload when completed", async () => {
    const payload = {
      kind: "crew-report",
      dataSource: "crew-agency",
      sourceJobId: SOURCE_JOB_ID,
      tool: "geo-readiness",
      endpoint: "/api/rapor-uret",
      reportMarkdown: "# Rapor",
      crewJobId: "crew-123",
      generatedAt: "2026-08-01T00:00:00.000Z",
    };
    const fakeDb = {
      query: vi
        .fn()
        .mockResolvedValue({
          rows: [{ status: "completed", result_payload: JSON.stringify(payload) }],
        }),
    };
    mockGetAdminDb.mockReturnValue(fakeDb);

    const result = await checkCrewReportStatusAction(CREW_JOB_ID);

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.status).toBe("completed");
      expect(result.data.report?.reportMarkdown).toBe("# Rapor");
      // Never lead data.
      expect(JSON.stringify(result.data)).not.toContain("work_email");
      expect("lead_id" in result.data).toBe(false);
    } else {
      throw new Error("expected a successful completed status result");
    }
  });

  it("omits the report when the completed payload is not a crew-report result", async () => {
    const fakeDb = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ status: "completed", result_payload: { kind: "other" } }] }),
    };
    mockGetAdminDb.mockReturnValue(fakeDb);

    const result = await checkCrewReportStatusAction(CREW_JOB_ID);

    expect(result).toEqual({ success: true, data: { status: "completed" } });
  });

  it("returns the failure contract when the database is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetAdminDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is required for admin routes");
    });

    const result = await checkCrewReportStatusAction(CREW_JOB_ID);

    expect(result).toEqual({ success: false, error: "Failed to check crew report status" });
  });
});
