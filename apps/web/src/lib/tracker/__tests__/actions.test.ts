import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateTrackerTargetInput } from "../validation";

const {
  mockGetAdminDb,
  mockCheckIpRateLimit,
  mockCreateTrackerRepository,
  mockHeaders,
  mockFindOrCreateSession,
  mockCreateTarget,
  mockCountActiveTargets,
  mockListTargetsByToken,
  mockDeactivateTarget,
  mockFindSessionByToken,
} = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockCheckIpRateLimit: vi.fn(),
  mockCreateTrackerRepository: vi.fn(),
  mockHeaders: vi.fn(),
  mockFindOrCreateSession: vi.fn(),
  mockCreateTarget: vi.fn(),
  mockCountActiveTargets: vi.fn(),
  mockListTargetsByToken: vi.fn(),
  mockDeactivateTarget: vi.fn(),
  mockFindSessionByToken: vi.fn(),
}));

vi.mock("../../admin/db", () => ({ getAdminDb: mockGetAdminDb }));
vi.mock("@seovista/worker", () => ({
  checkIpRateLimit: mockCheckIpRateLimit,
  createTrackerRepository: mockCreateTrackerRepository,
}));
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import { createTrackerTargetAction, listTrackerTargetsAction, deactivateTrackerTargetAction } from "../actions";

const SESSION_REF = "fixture-session-ref";
const SESSION_ID = "fixture-session-id";
const TARGET_ID = "fixture-target-id";

function setupRepoMock() {
  const repo = {
    findOrCreateSession: mockFindOrCreateSession,
    createTarget: mockCreateTarget,
    countActiveTargets: mockCountActiveTargets,
    listTargetsByToken: mockListTargetsByToken,
    deactivateTarget: mockDeactivateTarget,
    findSessionByToken: mockFindSessionByToken,
  };
  mockCreateTrackerRepository.mockReturnValue(repo);
}

function buildFormData(input: { email: string; keyword: string; domain: string }): FormData {
  const fd = new FormData();
  fd.set("email", input.email);
  fd.set("keyword", input.keyword);
  fd.set("domain", input.domain);
  return fd;
}

describe("validateTrackerTargetInput", () => {
  it("accepts valid email, keyword, and domain", () => {
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo denetimi", domain: "example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = validateTrackerTargetInput({ email: "not-an-email", keyword: "seo", domain: "example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty keyword", () => {
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "", domain: "example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty domain", () => {
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "" });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from email", () => {
    const result = validateTrackerTargetInput({ email: "  user@example.com  ", keyword: "seo", domain: "example.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });
});

describe("createTrackerTargetAction", () => {
  beforeEach(() => {
    setupRepoMock();
    process.env.REDIS_URL = "redis://localhost:8637";
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: true, remaining: 2, resetSeconds: 3600 });
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "127.0.0.1" }));
    mockFindOrCreateSession.mockResolvedValue({ id: SESSION_ID, token: SESSION_REF });
    mockCreateTarget.mockResolvedValue({ id: TARGET_ID });
    mockCountActiveTargets.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
  });

  it("creates a session and target, returns the token", async () => {
    const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
      email: "user@example.com", keyword: "seo denetimi", domain: "example.com",
    }));
    expect(result.status).toBe("success");
    expect(result.token).toBe(SESSION_REF);
    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com");
    expect(mockCreateTarget).toHaveBeenCalled();
  });

  it("returns error when rate limited", async () => {
    mockCheckIpRateLimit.mockResolvedValue({ success: false, remaining: 0, resetSeconds: 3600 });
    const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
      email: "user@example.com", keyword: "seo", domain: "example.com",
    }));
    expect(result.status).toBe("error");
    expect(result.errors?.form).toBeDefined();
  });

  it("returns error when max targets exceeded", async () => {
    mockCountActiveTargets.mockResolvedValue(5);
    const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
      email: "user@example.com", keyword: "seo", domain: "example.com",
    }));
    expect(result.status).toBe("error");
    expect(result.errors?.form?.[0]).toContain("maksimum");
  });

  it("returns error for invalid input", async () => {
    const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
      email: "not-email", keyword: "seo", domain: "example.com",
    }));
    expect(result.status).toBe("error");
    expect(result.errors?.email).toBeDefined();
  });
});

describe("listTrackerTargetsAction", () => {
  beforeEach(() => {
    setupRepoMock();
    mockGetAdminDb.mockReturnValue({});
    mockFindSessionByToken.mockResolvedValue({ id: SESSION_ID, email: "user@example.com" });
    mockListTargetsByToken.mockResolvedValue([
      { id: TARGET_ID, keyword: "seo", domain: "example.com", locale: "tr-TR", active: true, createdAt: new Date(), lastCheckedAt: null, latestPosition: null, latestCheckedAt: null, recentObservations: [] },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns targets for a valid token", async () => {
    const result = await listTrackerTargetsAction(SESSION_REF);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]!.keyword).toBe("seo");
    }
  });

  it("returns failure for unknown token", async () => {
    mockFindSessionByToken.mockResolvedValue(null);
    const result = await listTrackerTargetsAction("unknown");
    expect(result.success).toBe(false);
  });
});

describe("deactivateTrackerTargetAction", () => {
  beforeEach(() => {
    setupRepoMock();
    mockGetAdminDb.mockReturnValue({});
    mockDeactivateTarget.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deactivates a target successfully", async () => {
    const result = await deactivateTrackerTargetAction(SESSION_REF, TARGET_ID);
    expect(result.success).toBe(true);
    expect(mockDeactivateTarget).toHaveBeenCalledWith(SESSION_REF, TARGET_ID);
  });

  it("returns failure when target not owned by token", async () => {
    mockDeactivateTarget.mockResolvedValue(false);
    const result = await deactivateTrackerTargetAction(SESSION_REF, TARGET_ID);
    expect(result.success).toBe(false);
  });
});
