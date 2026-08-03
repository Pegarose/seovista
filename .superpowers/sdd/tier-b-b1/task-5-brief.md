## Task 5: Web Validation + Server Actions

**Files:**
- Create: `apps/web/src/lib/tracker/validation.ts`
- Create: `apps/web/src/lib/tracker/actions.ts`
- Test: `apps/web/src/lib/tracker/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `createTrackerRepository`, `checkIpRateLimit` from `@seovista/worker`, `extractClientIp` from `../geo-checker/ip`, `getAdminDb` from `../admin/db`, `headers` from `next/headers`
- Produces:
  - `validateTrackerTargetInput(input): ZodSafeParseResult` (sync, no "use server")
  - `createTrackerTargetAction(prevState, formData): Promise<TrackerTargetActionState>` (server action)
  - `listTrackerTargetsAction(token): Promise<TrackerTargetsResult>` (server action)
  - `deactivateTrackerTargetAction(token, targetId): Promise<{ success: boolean }>` (server action)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/tracker/__tests__/actions.test.ts`:

```typescript
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

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const TARGET_ID = "99999999-8888-4777-8666-555555555555";

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
    mockGetAdminDb.mockReturnValue({});
    mockCheckIpRateLimit.mockResolvedValue({ success: true, remaining: 2, resetSeconds: 3600 });
    mockHeaders.mockResolvedValue({ "x-forwarded-for": "127.0.0.1" });
    mockFindOrCreateSession.mockResolvedValue({ id: SESSION_ID, token: TOKEN });
    mockCreateTarget.mockResolvedValue({ id: TARGET_ID });
    mockCountActiveTargets.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session and target, returns the token", async () => {
    const result = await createTrackerTargetAction({ status: "idle" }, buildFormData({
      email: "user@example.com", keyword: "seo denetimi", domain: "example.com",
    }));
    expect(result.status).toBe("success");
    expect(result.token).toBe(TOKEN);
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
    const result = await listTrackerTargetsAction(TOKEN);
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
    const result = await deactivateTrackerTargetAction(TOKEN, TARGET_ID);
    expect(result.success).toBe(true);
    expect(mockDeactivateTarget).toHaveBeenCalledWith(TOKEN, TARGET_ID);
  });

  it("returns failure when target not owned by token", async () => {
    mockDeactivateTarget.mockResolvedValue(false);
    const result = await deactivateTrackerTargetAction(TOKEN, TARGET_ID);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web exec vitest run src/lib/tracker/__tests__/actions.test.ts`
Expected: FAIL — `Cannot find module '../validation'` and `Cannot find module '../actions'`

- [ ] **Step 3: Implement validation**

Create `apps/web/src/lib/tracker/validation.ts`:

```typescript
import { z } from "zod";

export const TrackerTargetFormSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta giriniz."),
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
});

export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string }) {
  return TrackerTargetFormSchema.safeParse(input);
}
```

- [ ] **Step 4: Implement server actions**

Create `apps/web/src/lib/tracker/actions.ts`:

```typescript
"use server";

import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateTrackerTargetInput } from "./validation";

export type TrackerTargetActionState = {
  status: "idle" | "error" | "success";
  token?: string;
  errors?: {
    email?: string[];
    keyword?: string[];
    domain?: string[];
    form?: string[];
  };
};

export async function createTrackerTargetAction(
  _prevState: TrackerTargetActionState,
  formData: FormData,
): Promise<TrackerTargetActionState> {
  const validated = validateTrackerTargetInput({
    email: formData.get("email")?.toString() ?? "",
    keyword: formData.get("keyword")?.toString() ?? "",
    domain: formData.get("domain")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { email, keyword, domain } = validated.data;

  try {
    const db = getAdminDb();
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required");
    }

    const reqHeaders = await headers();
    const clientIp = extractClientIp(reqHeaders);
    const limit = Number(process.env.TRACKER_PER_IP_RATE_LIMIT) || 3;

    const rateLimit = await checkIpRateLimit({
      redisUrl,
      ip: clientIp,
      limit,
      bucket: "tracker-create",
    });

    if (!rateLimit.success) {
      return {
        status: "error",
        errors: {
          form: [`Saatlik takip limitine (${limit}) ulaştınız. Lütfen daha sonra tekrar deneyiniz.`],
        },
      };
    }

    const repo = createTrackerRepository(db);
    const session = await repo.findOrCreateSession(email);

    const maxTargets = Number(process.env.TRACKER_MAX_TARGETS_PER_EMAIL) || 5;
    const currentCount = await repo.countActiveTargets(session.id);
    if (currentCount >= maxTargets) {
      return {
        status: "error",
        errors: {
          form: [`Bu e-posta için maksimum hedef sayısına (${maxTargets}) ulaştınız.`],
        },
      };
    }

    try {
      await repo.createTarget({
        sessionId: session.id,
        keyword,
        domain,
        locale: "tr-TR",
      });
    } catch {
      return {
        status: "error",
        errors: {
          form: ["Bu anahtar kelime zaten takip ediliyor."],
        },
      };
    }

    return { status: "success", token: session.token };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("Tracker target creation error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}

export type TrackerTargetsResult =
  | { success: true; targets: TargetWithObservations[]; email: string }
  | { success: false; error: string };

export async function listTrackerTargetsAction(token: string): Promise<TrackerTargetsResult> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);

    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }

    const targets = await repo.listTargetsByToken(token);
    return { success: true, targets, email: session.email };
  } catch (error) {
    console.error("Failed to list tracker targets:", error);
    return { success: false, error: "Takip paneli yüklenemedi." };
  }
}

export async function deactivateTrackerTargetAction(
  token: string,
  targetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const result = await repo.deactivateTarget(token, targetId);
    if (!result) {
      return { success: false, error: "Hedef bulunamadı veya bu panel tarafından sahiplenilmiyor." };
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to deactivate tracker target:", error);
    return { success: false, error: "Hedef kaldırılamadı." };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/lib/tracker/__tests__/actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/tracker/validation.ts apps/web/src/lib/tracker/actions.ts apps/web/src/lib/tracker/__tests__/actions.test.ts
git commit -m "feat(web): tracker validation + server actions — create/list/deactivate targets

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---


