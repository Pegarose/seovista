import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateTrackerSessionTargetInput } from "../lib/tracker/validation";
import { randomUUID } from "node:crypto";

// --- Mocks ---

const mockFindSessionByToken = vi.fn();
const mockCountActiveTargets = vi.fn();
const mockCreateTarget = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(() => ({
    findSessionByToken: mockFindSessionByToken,
    countActiveTargets: mockCountActiveTargets,
    createTarget: mockCreateTarget,
  })),
  checkIpRateLimit: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("../geo-checker/ip", () => ({
  extractClientIp: vi.fn(() => "127.0.0.1"),
}));

// --- Schema tests (from Task 2) ---

describe("TrackerSessionTargetSchema", () => {
  it("accepts valid keyword and domain", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "seo denetimi", domain: "example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyword).toBe("seo denetimi");
      expect(result.data.domain).toBe("example.com");
    }
  });

  it("rejects empty keyword", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "", domain: "example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty domain", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "seo", domain: "" });
    expect(result.success).toBe(false);
  });

  it("rejects keyword over 200 chars", () => {
    const result = validateTrackerSessionTargetInput({ keyword: "x".repeat(201), domain: "example.com" });
    expect(result.success).toBe(false);
  });
});

// --- Action tests ---

describe("createTrackerTargetForSessionAction", () => {
  const VALID_TOKEN = randomUUID();
  const SESSION_ID = randomUUID();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindSessionByToken.mockResolvedValue({ id: SESSION_ID, email: "user@example.com" });
    mockCountActiveTargets.mockResolvedValue(0);
    mockCreateTarget.mockResolvedValue({ id: randomUUID() });

    const { checkIpRateLimit } = await import("@seovista/worker");
    vi.mocked(checkIpRateLimit).mockResolvedValue({ success: true, remaining: 2, resetSeconds: 3600 });
  });

  it("returns error for unknown token", async () => {
    mockFindSessionByToken.mockResolvedValue(null);
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.form).toContain("Oturum bulunamadı.");
  });

  it("returns validation error for empty keyword", async () => {
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.keyword).toBeDefined();
  });

  it("returns error when rate limit exceeded", async () => {
    const { checkIpRateLimit } = await import("@seovista/worker");
    vi.mocked(checkIpRateLimit).mockResolvedValue({ success: false, remaining: 0, resetSeconds: 3600 });
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toContain("Saatlik takip limitine");
  });

  it("returns error when max targets exceeded", async () => {
    mockCountActiveTargets.mockResolvedValue(5);
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toContain("maksimum hedef sayısına");
  });

  it("returns duplicate error on PG 23505", async () => {
    mockCreateTarget.mockRejectedValue({ code: "23505" });
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.form).toContain("Bu anahtar kelime zaten takip ediliyor.");
  });

  it("returns system error on non-23505 DB error", async () => {
    mockCreateTarget.mockRejectedValue(new Error("connection lost"));
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toContain("Sistem hatası");
  });

  it("returns success and calls revalidatePath on valid input", async () => {
    const { revalidatePath } = await import("next/cache");
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const formData = new FormData();
    formData.set("keyword", "seo denetimi");
    formData.set("domain", "example.com");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith(`/tracker/${VALID_TOKEN}`);
  });
});
