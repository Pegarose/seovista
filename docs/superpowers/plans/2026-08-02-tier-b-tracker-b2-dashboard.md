# Tier B B2 Tracker Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace B1's minimal tracker table with a card-based dashboard featuring server-rendered SVG trend charts (90-day window), inline target creation, CSV export, and `router.refresh()` migration.

**Architecture:** RSC-first card layout — `TrendChart` is a pure server-rendered SVG component (zero client JS). Small client islands (`DeactivateButton`, `AddTargetForm`) handle genuine interaction. CSV export is a route handler returning semicolon-delimited UTF-8 BOM text. Repository changes: `LIMIT 7 → 90` + add `top_competitors` to the observation query/type.

**Tech Stack:** Next.js App Router (RSC), React 19, Tailwind CSS v4, Zod, Vitest, `renderToStaticMarkup` for component tests, PostgreSQL via `pg`.

## Global Constraints

- TypeScript strict mode (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`)
- pnpm exclusively; Node 24 LTS, `pnpm@10.30.1`
- Server Components by default; Client Components only for genuine browser interaction (`"use client"`)
- Every page has exactly one `<h1>` inside one `<main id="main">` landmark
- Turkish UI text throughout
- Never fabricate data — positions are real SERP observations
- `position = 0` means "not found in top 10" — rendered honestly, never as a real position
- No new dependencies, no new migration, no new env vars
- Worker tests require: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'` before running
- Web test command: `pnpm --filter @seovista/web test`
- Worker test command: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test`
- Worker typecheck: `pnpm --filter @seovista/worker typecheck`
- Web typecheck: `pnpm --filter @seovista/web typecheck`
- Droid-Shield: use `crypto.randomUUID()` in tests, never hardcode UUID literals

**Spec:** `docs/superpowers/specs/2026-08-02-tier-b-tracker-b2-dashboard-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/worker/src/db/tracker-repository.ts` | Modify | `LIMIT 7 → 90` + add `top_competitors` to observation query and `recentObservations` type |
| `apps/worker/src/__tests__/tracker-repository.test.ts` | Modify | Update observation cap test 7→90 + verify `topCompetitors` in result |
| `apps/web/src/lib/tracker/validation.ts` | Modify | Add `TrackerSessionTargetSchema` + `validateTrackerSessionTargetInput` |
| `apps/web/src/lib/tracker/actions.ts` | Modify | Add `createTrackerTargetForSessionAction` |
| `apps/web/src/__tests__/tracker-actions.test.ts` | Create | Tests for `createTrackerTargetForSessionAction` |
| `apps/web/src/components/tracker/trend-chart.tsx` | Create | RSC pure SVG line chart |
| `apps/web/src/__tests__/trend-chart.test.ts` | Create | SVG contract tests |
| `apps/web/src/components/tracker/deactivate-button.tsx` | Create | Client island: deactivate + `router.refresh()` |
| `apps/web/src/components/tracker/add-target-form.tsx` | Create | Client island: inline keyword+domain form |
| `apps/web/src/components/tracker/tracker-target-card.tsx` | Create | RSC: per-target card with chart + meta + deactivate |
| `apps/web/app/tracker/[token]/page.tsx` | Modify | RSC card layout, export link, inline form |
| `apps/web/src/components/tracker/tracker-dashboard.tsx` | Delete | Replaced by card layout |
| `apps/web/src/__tests__/tracker-pages.test.ts` | Modify | Update for card layout + export link |
| `apps/web/app/tracker/[token]/export/route.ts` | Create | CSV export route handler |
| `apps/web/src/__tests__/tracker-export-route.test.ts` | Create | CSV format + 404 contract tests |

---

### Task 1: Repository LIMIT 7 → 90 + top_competitors in Observation Type

**Files:**
- Modify: `apps/worker/src/db/tracker-repository.ts` (the `listTargetsByToken` method + `TargetWithObservations` type)
- Test: `apps/worker/src/__tests__/tracker-repository.test.ts` (the "up to 7 recent observations" test + the "insertObservation" test)

**Interfaces:**
- Produces: `listTargetsByToken` now returns up to 90 observations per target (was 7). The `TargetWithObservations.recentObservations` array type gains a `topCompetitors` field: `Array<{ position: number; checkedAt: string; topCompetitors: Array<{ rank: number; domain: string }> }>`. All downstream consumers (TrendChart, CSV export) use this richer type.

- [ ] **Step 1: Update the failing test**

In `apps/worker/src/__tests__/tracker-repository.test.ts`, find the test:

```ts
  it("listTargetsByToken includes up to 7 recent observations ordered by date desc", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    for (let i = 1; i <= 10; i++) {
      await repo.insertObservation({ targetId: target.id, position: i, topCompetitors: [] });
    }
    await repo.updateLastCheckedAt(target.id);
    const targets = await repo.listTargetsByToken(session.token);
    expect(targets[0]!.recentObservations).toHaveLength(7);
    expect(targets[0]!.recentObservations[0]!.position).toBe(10); // most recent first
  });
```

Replace it with:

```ts
  it("listTargetsByToken includes up to 90 recent observations ordered by date desc with topCompetitors", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    for (let i = 1; i <= 95; i++) {
      await repo.insertObservation({ targetId: target.id, position: i, topCompetitors: [] });
    }
    await repo.updateLastCheckedAt(target.id);
    const targets = await repo.listTargetsByToken(session.token);
    expect(targets[0]!.recentObservations).toHaveLength(90);
    expect(targets[0]!.recentObservations[0]!.position).toBe(95); // most recent first
  });
```

Also update the "insertObservation and updateLastCheckedAt work together" test to verify `topCompetitors` is returned. Find:

```ts
    expect(targets[0]!.recentObservations).toHaveLength(1);
  });
```

Replace with:

```ts
    expect(targets[0]!.recentObservations).toHaveLength(1);
    expect(targets[0]!.recentObservations[0]!.topCompetitors).toHaveLength(2);
    expect(targets[0]!.recentObservations[0]!.topCompetitors[0]!.domain).toBe("rival1.com");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- --reporter=verbose tracker-repository`
Expected: FAIL — `expected 7 to be 90` (the repository still caps at 7)

- [ ] **Step 3: Update the repository LIMIT + query + type**

In `apps/worker/src/db/tracker-repository.ts`, first update the `TargetWithObservations` interface. Find:

```ts
  recentObservations: Array<{ position: number; checkedAt: string }>;
```

Replace with:

```ts
  recentObservations: Array<{ position: number; checkedAt: string; topCompetitors: Array<{ rank: number; domain: string }> }>;
```

Then update the observation query in `listTargetsByToken`. Find:

```ts
        `SELECT position, checked_at FROM rank_observations
           WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 7`,
```

Replace with:

```ts
        `SELECT position, checked_at, top_competitors FROM rank_observations
           WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 90`,
```

Then update the mapping. Find:

```ts
        const recentObs = obsRes.rows.map((o) => ({
          position: o.position,
          checkedAt: o.checked_at.toISOString(),
        }));
```

Replace with:

```ts
        const recentObs = obsRes.rows.map((o) => ({
          position: o.position,
          checkedAt: o.checked_at.toISOString(),
          topCompetitors: o.top_competitors as Array<{ rank: number; domain: string }>,
        }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- --reporter=verbose tracker-repository`
Expected: PASS

- [ ] **Step 5: Typecheck the worker**

Run: `pnpm --filter @seovista/worker typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/db/tracker-repository.ts apps/worker/src/__tests__/tracker-repository.test.ts
git commit -m "feat(tracker): listTargetsByToken LIMIT 7->90 + top_competitors in observation type

- Observation cap extended from 7 to 90 for B2 trend charts
- top_competitors JSONB added to SELECT and recentObservations type
- Needed by CSV export route (Task 9) and 90-day trend chart window"
```

---

### Task 2: Validation Schema for Session-Based Target Creation

**Files:**
- Modify: `apps/web/src/lib/tracker/validation.ts`
- Test: `apps/web/src/__tests__/tracker-actions.test.ts` (created in Task 3, but schema tested here first via a quick inline check — see step 1)

**Interfaces:**
- Produces: `TrackerSessionTargetSchema` (Zod object with `keyword` and `domain` only — no email), `validateTrackerSessionTargetInput({ keyword, domain })` returning a Zod `SafeParseReturnType`.

- [ ] **Step 1: Write a failing test for the new schema**

Create `apps/web/src/__tests__/tracker-actions.test.ts` with this initial content (the schema test only — action tests are added in Task 3):

```ts
import { describe, it, expect } from "vitest";
import { validateTrackerSessionTargetInput } from "../lib/tracker/validation";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-actions`
Expected: FAIL — `validateTrackerSessionTargetInput is not a function` (not yet exported)

- [ ] **Step 3: Add the schema to validation.ts**

In `apps/web/src/lib/tracker/validation.ts`, append after the existing `TrackerTargetFormSchema` and `validateTrackerTargetInput`:

```ts
/**
 * Session-based target validation — used by the inline AddTargetForm on the
 * /tracker/[token] dashboard. Unlike TrackerTargetFormSchema, this schema
 * omits email because the session is resolved from the URL token.
 */
export const TrackerSessionTargetSchema = z.object({
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
});

export function validateTrackerSessionTargetInput(input: { keyword: string; domain: string }) {
  return TrackerSessionTargetSchema.safeParse(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-actions`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/tracker/validation.ts apps/web/src/__tests__/tracker-actions.test.ts
git commit -m "feat(tracker): add TrackerSessionTargetSchema for inline dashboard form"
```

---

### Task 3: createTrackerTargetForSessionAction Server Action

**Files:**
- Modify: `apps/web/src/lib/tracker/actions.ts`
- Test: `apps/web/src/__tests__/tracker-actions.test.ts` (extend)

**Interfaces:**
- Consumes: `validateTrackerSessionTargetInput` from Task 2, `createTrackerRepository` + `findSessionByToken` + `countActiveTargets` + `createTarget` from `@seovista/worker`, `checkIpRateLimit` from `@seovista/worker`, `extractClientIp` from `../geo-checker/ip`, `getAdminDb` from `../admin/db`, `headers` from `next/headers`, `revalidatePath` from `next/cache`
- Produces: `createTrackerTargetForSessionAction(token: string, _prevState: TrackerSessionTargetActionState, formData: FormData): Promise<TrackerSessionTargetActionState` — a server action for `useActionState` that creates a target by looking up the session from the token (no email input needed).

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/__tests__/tracker-actions.test.ts` (after the schema tests). This requires extensive mocking — add the mock setup at the top of the file and the action tests in a new describe block.

Replace the entire file content with:

```ts
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
    vi.mocked(checkIpRateLimit).mockResolvedValue({ success: true, remaining: 2 });
  });

  it("returns error for unknown token", async () => {
    mockFindSessionByToken.mockResolvedValue(null);
    const { createTrackerTargetForSessionAction } = await import("../lib/tracker/actions");
    const result = await createTrackerTargetForSessionAction(
      VALID_TOKEN,
      { status: "idle" },
      new FormData(),
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
    vi.mocked(checkIpRateLimit).mockResolvedValue({ success: false, remaining: 0 });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-actions`
Expected: FAIL — `createTrackerTargetForSessionAction is not a function` (not yet exported)

- [ ] **Step 3: Implement the server action**

In `apps/web/src/lib/tracker/actions.ts`, add the import for `revalidatePath` at the top. Find the existing import block:

```ts
import { headers } from "next/headers";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateTrackerTargetInput } from "./validation";
```

Add `revalidatePath` import after `headers`:

```ts
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAdminDb } from "../admin/db";
import { checkIpRateLimit, createTrackerRepository, type TargetWithObservations } from "@seovista/worker";
import { extractClientIp } from "../geo-checker/ip";
import { validateTrackerTargetInput, validateTrackerSessionTargetInput } from "./validation";
```

Then add the `TOKEN_RE` constant and the new action type + function. Append this after the existing `deactivateTrackerTargetAction` function at the end of the file:

```ts
// --- B2: Session-based target creation (inline dashboard form) ---

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrackerSessionTargetActionState = {
  status: "idle" | "error" | "success";
  errors?: {
    keyword?: string[];
    domain?: string[];
    form?: string[];
  };
};

export async function createTrackerTargetForSessionAction(
  token: string,
  _prevState: TrackerSessionTargetActionState,
  formData: FormData,
): Promise<TrackerSessionTargetActionState> {
  const validated = validateTrackerSessionTargetInput({
    keyword: formData.get("keyword")?.toString() ?? "",
    domain: formData.get("domain")?.toString() ?? "",
  });

  if (!validated.success) {
    return {
      status: "error",
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { keyword, domain } = validated.data;

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

    // Defense in depth: the page already gates on UUID format, but this
    // action is called from a client island that receives the token as a prop.
    if (!TOKEN_RE.test(token)) {
      return {
        status: "error",
        errors: { form: ["Oturum bulunamadı."] },
      };
    }

    const session = await repo.findSessionByToken(token);
    if (!session) {
      return {
        status: "error",
        errors: { form: ["Oturum bulunamadı."] },
      };
    }

    const maxTargets = Number(process.env.TRACKER_MAX_TARGETS_PER_EMAIL) || 5;
    const currentCount = await repo.countActiveTargets(session.id);
    if (currentCount >= maxTargets) {
      return {
        status: "error",
        errors: {
          form: [`Bu panel için maksimum hedef sayısına (${maxTargets}) ulaştınız.`],
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
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        return {
          status: "error",
          errors: {
            form: ["Bu anahtar kelime zaten takip ediliyor."],
          },
        };
      }
      throw error;
    }

    revalidatePath(`/tracker/${token}`);
    return { status: "success" };
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
    console.error("Tracker session target creation error:", error);
    return {
      status: "error",
      errors: {
        form: ["Sistem hatası nedeniyle hedef eklenemedi. Lütfen daha sonra tekrar deneyiniz."],
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-actions`
Expected: PASS (11 tests: 4 schema + 7 action)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/tracker/actions.ts apps/web/src/__tests__/tracker-actions.test.ts
git commit -m "feat(tracker): add createTrackerTargetForSessionAction for inline dashboard form"
```

---

### Task 4: TrendChart RSC Component (Pure SVG)

**Files:**
- Create: `apps/web/src/components/tracker/trend-chart.tsx`
- Test: `apps/web/src/__tests__/trend-chart.test.ts`

**Interfaces:**
- Consumes: `observations: Array<{ position: number; checkedAt: string }>` (DESC order from repository; the component reverses to ASC internally), `keyword: string`
- Produces: `<TrendChart observations={...} keyword={...} />` — an RSC that renders pure SVG. Returns `null` when observations is empty.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/__tests__/trend-chart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendChart } from "../components/tracker/trend-chart";

// Helper: generate N daily observations descending (as the repository returns them).
function makeObservations(positions: number[], daysAgo = 0): Array<{ position: number; checkedAt: string }> {
  return positions.map((pos, i) => {
    const date = new Date(2026, 6, 1 + i); // July 1, 2, 3, ...
    return { position: pos, checkedAt: date.toISOString() };
  }).reverse(); // DESC like the repository
}

describe("TrendChart", () => {
  it("renders an SVG with role=img and aria-label containing the keyword", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5, 3, 2]),
        keyword: "seo denetimi",
      }),
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain('role="img"');
    expect(markup).toContain("seo denetimi");
  });

  it("inverts Y axis: position 1 point has smaller cy than position 10", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([1, 10]),
        keyword: "test",
      }),
    );
    // Extract cy values from circles
    const cyMatches = [...markup.matchAll(/cy="([\d.]+)"/g)];
    expect(cyMatches.length).toBeGreaterThanOrEqual(2);
    const cy1 = parseFloat(cyMatches[0]![1]);
    const cy2 = parseFloat(cyMatches[1]![1]);
    // Position 1 (first observation) should have smaller y (higher on screen)
    expect(cy1).toBeLessThan(cy2);
  });

  it("renders position=0 as amber circle with 'İlk 10'da yok' title", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([3, 0, 5]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("#f59e0b"); // amber-500
    expect(markup).toContain("İlk 10'da yok");
  });

  it("renders a <title> tooltip with date and position for in-top-10 points", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([3]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<title");
    expect(markup).toContain("#3");
  });

  it("renders a <details> element with a data table containing all observations", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5, 3, 2]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<details");
    expect(markup).toContain("<table");
    expect(markup).toContain("Veri tablosunu göster");
  });

  it("renders null for empty observations", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: [],
        keyword: "test",
      }),
    );
    expect(markup).toBe("");
  });

  it("renders a single circle without polyline for single observation", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<circle");
    expect(markup).not.toContain("<polyline");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose trend-chart`
Expected: FAIL — `Cannot find module '../components/tracker/trend-chart'`

- [ ] **Step 3: Implement TrendChart**

Create `apps/web/src/components/tracker/trend-chart.tsx`:

```tsx
interface TrendChartProps {
  observations: Array<{ position: number; checkedAt: string }>;
  keyword: string;
}

const VIEW_W = 560;
const VIEW_H = 160;
const PAD_LEFT = 32;
const PAD_RIGHT = 24;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const CHART_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const CHART_H = VIEW_H - PAD_TOP - PAD_BOTTOM;
const ZERO_BAND_Y = PAD_TOP + CHART_H + 12;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function TrendChart({ observations, keyword }: TrendChartProps) {
  if (observations.length === 0) return null;

  // Reverse to ascending order for charting
  const obs = [...observations].reverse();

  const dates = obs.map((o) => new Date(o.checkedAt).getTime());
  const firstMs = dates[0]!;
  const lastMs = dates[dates.length - 1]!;
  const timeSpan = lastMs - firstMs;

  function xPos(ms: number): number {
    if (timeSpan === 0) return PAD_LEFT + CHART_W / 2;
    return PAD_LEFT + ((ms - firstMs) / timeSpan) * CHART_W;
  }

  function yPos(position: number): number {
    // Inverted: position 1 at top, position 10 at bottom
    return PAD_TOP + ((position - 1) / 9) * CHART_H;
  }

  // Separate in-top-10 points from position=0 points
  const inTop10 = obs.filter((o) => o.position > 0 && o.position <= 10);
  const notFound = obs.filter((o) => o.position === 0);

  // Build polyline points for in-top-10 only (segments break at position=0 gaps)
  const polylinePoints = inTop10
    .map((o) => `${xPos(new Date(o.checkedAt).getTime())},${yPos(o.position)}`)
    .join(" ");

  // X-axis ticks: ~6 spread across the time range
  const tickCount = Math.min(6, obs.length);
  const ticks: Array<{ x: number; label: string }> = [];
  for (let i = 0; i < tickCount; i++) {
    const ratio = tickCount === 1 ? 0.5 : i / (tickCount - 1);
    const ms = firstMs + ratio * timeSpan;
    ticks.push({ x: xPos(ms), label: formatDate(new Date(ms).toISOString()) });
  }

  // Accessibility summary
  const firstPos = obs[0]!.position;
  const lastPos = obs[obs.length - 1]!.position;
  const ariaLabel = `${keyword}: son ${obs.length} günde ${firstPos > 0 ? "#" + firstPos : "ilk 10'da yok"} → ${lastPos > 0 ? "#" + lastPos : "ilk 10'da yok"}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Y-axis labels */}
        <text x={PAD_LEFT - 8} y={PAD_TOP + 4} fill="#94a3b8" fontSize="11" textAnchor="end">1</text>
        <text x={PAD_LEFT - 8} y={PAD_TOP + CHART_H + 4} fill="#94a3b8" fontSize="11" textAnchor="end">10</text>

        {/* X-axis ticks */}
        {ticks.map((t, i) => (
          <text key={i} x={t.x} y={VIEW_H - 8} fill="#94a3b8" fontSize="11" textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* Polyline through in-top-10 points */}
        {inTop10.length > 1 && (
          <polyline
            points={polylinePoints}
            stroke="#0f172a"
            strokeWidth="1.5"
            fill="none"
          />
        )}

        {/* In-top-10 points with tooltips */}
        {inTop10.map((o, i) => {
          const x = xPos(new Date(o.checkedAt).getTime());
          const y = yPos(o.position);
          return (
            <circle key={`top-${i}`} cx={x} cy={y} r="3" fill="#0f172a">
              <title>{`${formatDate(o.checkedAt)} — #${o.position}`}</title>
            </circle>
          );
        })}

        {/* Position=0 markers (not in top 10) */}
        {notFound.map((o, i) => {
          const x = xPos(new Date(o.checkedAt).getTime());
          return (
            <circle key={`zero-${i}`} cx={x} cy={ZERO_BAND_Y} r="3" fill="#f59e0b">
              <title>{`${formatDate(o.checkedAt)} — İlk 10'da yok`}</title>
            </circle>
          );
        })}
      </svg>

      <details>
        <summary className="text-sm text-slate-600 cursor-pointer">Veri tablosunu göster</summary>
        <table className="mt-2 w-full text-xs text-slate-600">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4 text-left font-semibold">Tarih</th>
              <th scope="col" className="py-1 text-left font-semibold">Sıra</th>
            </tr>
          </thead>
          <tbody>
            {obs.map((o, i) => (
              <tr key={i}>
                <td className="py-1 pr-4 tabular-nums">{formatDate(o.checkedAt)}</td>
                <td className="py-1 tabular-nums">{o.position > 0 ? `#${o.position}` : "İlk 10'da yok"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose trend-chart`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tracker/trend-chart.tsx apps/web/src/__tests__/trend-chart.test.ts
git commit -m "feat(tracker): add server-rendered SVG TrendChart component"
```

---

### Task 5: DeactivateButton Client Island

**Files:**
- Create: `apps/web/src/components/tracker/deactivate-button.tsx`

**Interfaces:**
- Consumes: `deactivateTrackerTargetAction` from `../../lib/tracker/actions`, `useRouter` + `router.refresh()` from `next/navigation`
- Produces: `<DeactivateButton token={string} targetId={string} active={boolean} />` — a client component that deactivates a target and calls `router.refresh()`.

- [ ] **Step 1: Write the failing test**

Create a test section in `apps/web/src/__tests__/tracker-pages.test.ts` is not ideal — better as a standalone test. But the established pattern (tracker-track-this-button.test.ts) tests client components via `renderToStaticMarkup` for their initial render state. Since `DeactivateButton` uses `useRouter` (a client-only hook), we mock it.

Create `apps/web/src/__tests__/deactivate-button.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  deactivateTrackerTargetAction: vi.fn(),
}));

describe("DeactivateButton", () => {
  it("renders Kaldır button when active", async () => {
    const { DeactivateButton } = await import("../components/tracker/deactivate-button");
    const markup = renderToStaticMarkup(
      React.createElement(DeactivateButton, {
        token: "token-abc",
        targetId: "target-xyz",
        active: true,
      }),
    );
    expect(markup).toContain("Kaldır");
    expect(markup).toContain("<button");
  });

  it("renders nothing when inactive", async () => {
    const { DeactivateButton } = await import("../components/tracker/deactivate-button");
    const markup = renderToStaticMarkup(
      React.createElement(DeactivateButton, {
        token: "token-abc",
        targetId: "target-xyz",
        active: false,
      }),
    );
    expect(markup).not.toContain("Kaldır");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose deactivate-button`
Expected: FAIL — `Cannot find module '../components/tracker/deactivate-button'`

- [ ] **Step 3: Implement DeactivateButton**

Create `apps/web/src/components/tracker/deactivate-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateTrackerTargetAction } from "../../lib/tracker/actions";

export function DeactivateButton({
  token,
  targetId,
  active,
}: {
  token: string;
  targetId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!active) return null;

  function handleClick() {
    startTransition(async () => {
      try {
        await deactivateTrackerTargetAction(token, targetId);
        router.refresh();
      } catch {
        // Error is logged in the action; the button resets on next render
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? "Kaldırılıyor..." : "Kaldır"}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose deactivate-button`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tracker/deactivate-button.tsx apps/web/src/__tests__/deactivate-button.test.ts
git commit -m "feat(tracker): add DeactivateButton client island with router.refresh()"
```

---

### Task 6: AddTargetForm Client Island

**Files:**
- Create: `apps/web/src/components/tracker/add-target-form.tsx`

**Interfaces:**
- Consumes: `createTrackerTargetForSessionAction` + `TrackerSessionTargetActionState` from `../../lib/tracker/actions` (Task 3)
- Produces: `<AddTargetForm token={string} />` — a client component with keyword + domain inputs using `useActionState`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/add-target-form.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetForSessionAction: vi.fn(),
  TrackerSessionTargetActionState: {},
}));

describe("AddTargetForm", () => {
  it("renders keyword and domain inputs with a form", async () => {
    const { AddTargetForm } = await import("../components/tracker/add-target-form");
    const token = randomUUID();
    const markup = renderToStaticMarkup(
      React.createElement(AddTargetForm, { token }),
    );
    expect(markup).toContain("<form");
    expect(markup).toContain('name="keyword"');
    expect(markup).toContain('name="domain"');
    expect(markup).toContain('type="submit"');
  });

  it("does not include an email input (email is implicit from session)", async () => {
    const { AddTargetForm } = await import("../components/tracker/add-target-form");
    const token = randomUUID();
    const markup = renderToStaticMarkup(
      React.createElement(AddTargetForm, { token }),
    );
    expect(markup).not.toContain('name="email"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose add-target-form`
Expected: FAIL — `Cannot find module '../components/tracker/add-target-form'`

- [ ] **Step 3: Implement AddTargetForm**

Create `apps/web/src/components/tracker/add-target-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  createTrackerTargetForSessionAction,
  type TrackerSessionTargetActionState,
} from "../../lib/tracker/actions";

const initialState: TrackerSessionTargetActionState = { status: "idle" };

export function AddTargetForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetForSessionAction.bind(null, token),
    initialState,
  );

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Yeni Hedef Ekle</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="add-keyword" className="block text-sm font-medium text-slate-700 mb-1">
            Anahtar Kelime
          </label>
          <input
            id="add-keyword"
            name="keyword"
            type="text"
            required
            placeholder="seo denetimi"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.keyword && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.keyword[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="add-domain" className="block text-sm font-medium text-slate-700 mb-1">
            Alan Adı
          </label>
          <input
            id="add-domain"
            name="domain"
            type="text"
            required
            placeholder="ornek.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.domain && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.domain[0]}</p>
          )}
        </div>

        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Hedef Ekle"}
        </button>
      </form>

      {state.status === "success" && (
        <p className="text-sm text-green-700" role="status">
          Yeni hedef eklendi. Takip paneliniz güncelleniyor.
        </p>
      )}
    </div>
  );
}
```

Note: `useActionState` requires the action to match the signature `(prevState, formData) => state`. Since our action takes `token` as a first arg, we use `.bind(null, token)` to partially apply it. This means the action signature is `(token, prevState, formData)` and after binding it becomes `(prevState, formData)` — which is what `useActionState` expects.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose add-target-form`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tracker/add-target-form.tsx apps/web/src/__tests__/add-target-form.test.ts
git commit -m "feat(tracker): add inline AddTargetForm client island for dashboard"
```

---

### Task 7: TrackerTargetCard RSC Component

**Files:**
- Create: `apps/web/src/components/tracker/tracker-target-card.tsx`

**Interfaces:**
- Consumes: `TrendChart` from Task 4, `DeactivateButton` from Task 5, `TargetWithObservations` type from `@seovista/worker`
- Produces: `<TrackerTargetCard target={TargetWithObservations} token={string} />` — an RSC that renders a single target's card.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/tracker-target-card.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/tracker/actions", () => ({
  deactivateTrackerTargetAction: vi.fn(),
}));

describe("TrackerTargetCard", () => {
  function makeTarget(overrides: Partial<{
    id: string;
    keyword: string;
    domain: string;
    active: boolean;
    latestPosition: number | null;
    latestCheckedAt: string | null;
    recentObservations: Array<{ position: number; checkedAt: string }>;
  }> = {}) {
    return {
      id: overrides.id ?? randomUUID(),
      keyword: overrides.keyword ?? "seo denetimi",
      domain: overrides.domain ?? "example.com",
      locale: "tr-TR",
      active: overrides.active ?? true,
      createdAt: new Date("2026-07-01"),
      lastCheckedAt: overrides.latestCheckedAt ? new Date(overrides.latestCheckedAt) : null,
      latestPosition: overrides.latestPosition ?? 3,
      latestCheckedAt: overrides.latestCheckedAt ?? "2026-08-01T03:00:00.000Z",
      recentObservations: overrides.recentObservations ?? [
        { position: 5, checkedAt: "2026-07-30T03:00:00.000Z", topCompetitors: [] },
        { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
      ],
    };
  }

  it("renders an h2 with the keyword", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ keyword: "seo danışmanlığı" }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("<h2");
    expect(markup).toContain("seo danışmanlığı");
  });

  it("renders the domain in font-mono", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ domain: "test.com" }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("test.com");
    expect(markup).toContain("font-mono");
  });

  it("renders latest position as #3 when position is 3", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: 3 }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("#3");
  });

  it("renders 'İlk 10'da yok' when latestPosition is 0", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: 0 }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("İlk 10'da yok");
  });

  it("renders 'Henüz kontrol edilmedi' when latestPosition is null", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ latestPosition: null, latestCheckedAt: null }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("Henüz kontrol edilmedi");
  });

  it("renders empty state text when observations is empty", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({
          latestPosition: null,
          latestCheckedAt: null,
          recentObservations: [],
        }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("İlk kontrol bu gece 03:00 UTC'de yapılacak");
  });

  it("renders Pasif badge and no Kaldır button when inactive", async () => {
    const { TrackerTargetCard } = await import("../components/tracker/tracker-target-card");
    const markup = renderToStaticMarkup(
      React.createElement(TrackerTargetCard, {
        target: makeTarget({ active: false }),
        token: randomUUID(),
      }),
    );
    expect(markup).toContain("Pasif");
    expect(markup).not.toContain("Kaldır");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-target-card`
Expected: FAIL — `Cannot find module '../components/tracker/tracker-target-card'`

- [ ] **Step 3: Implement TrackerTargetCard**

Create `apps/web/src/components/tracker/tracker-target-card.tsx`:

```tsx
import { TrendChart } from "./trend-chart";
import { DeactivateButton } from "./deactivate-button";
import type { TargetWithObservations } from "@seovista/worker";

export function TrackerTargetCard({
  target,
  token,
}: {
  target: TargetWithObservations;
  token: string;
}) {
  const latestPositionText =
    target.latestPosition !== null && target.latestPosition > 0
      ? `#${target.latestPosition}`
      : target.latestPosition === 0
        ? "İlk 10'da yok"
        : "Henüz kontrol edilmedi";

  const lastCheckedText = target.latestCheckedAt
    ? new Date(target.latestCheckedAt).toLocaleDateString("tr-TR")
    : "—";

  return (
    <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{target.keyword}</h2>
          <p className="text-sm font-mono text-slate-600 mt-0.5">{target.domain}</p>
        </div>
        {!target.active && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Pasif
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="tabular-nums font-semibold text-slate-900">{latestPositionText}</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-600">Son kontrol: {lastCheckedText}</span>
      </div>

      {target.recentObservations.length > 0 ? (
        <TrendChart
          observations={target.recentObservations}
          keyword={target.keyword}
        />
      ) : (
        <p className="text-sm text-slate-500 italic">
          İlk kontrol bu gece 03:00 UTC'de yapılacak.
        </p>
      )}

      {target.active && (
        <div className="pt-2 border-t border-slate-100">
          <DeactivateButton token={token} targetId={target.id} active={target.active} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-target-card`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tracker/tracker-target-card.tsx apps/web/src/__tests__/tracker-target-card.test.ts
git commit -m "feat(tracker): add TrackerTargetCard RSC with chart + meta + deactivate"
```

---

### Task 8: Page Restructure + Delete tracker-dashboard

**Files:**
- Modify: `apps/web/app/tracker/[token]/page.tsx`
- Delete: `apps/web/src/components/tracker/tracker-dashboard.tsx`
- Modify: `apps/web/src/__tests__/tracker-pages.test.ts`

**Interfaces:**
- Consumes: `AddTargetForm` from Task 6, `TrackerTargetCard` from Task 7, `listTrackerTargetsAction` from existing actions, `TargetWithObservations` type from `@seovista/worker`
- Produces: restructured `/tracker/[token]` page with card layout, export link, inline form. Old `TrackerDashboard` deleted.

- [ ] **Step 1: Update the page tests**

In `apps/web/src/__tests__/tracker-pages.test.ts`, the existing mocks need to be updated. The old `TrackerDashboard` import is replaced by `TrackerTargetCard` + `AddTargetForm` which are imported by the page. Since the page imports them, the test mocks need to accommodate.

Replace the mock section. Find:

```ts
vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  deactivateTrackerTargetAction: vi.fn(),
}));
```

Replace with:

```ts
vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  createTrackerTargetForSessionAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  deactivateTrackerTargetAction: vi.fn(),
}));
```

Also add a mock for `next/navigation` `useRouter` (needed by client islands rendered inside the page):

Find the existing `vi.mock("next/navigation", ...)`:

```ts
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
```

Replace with:

```ts
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
```

Now add tests for the card layout and export link. Append a new describe block at the end of the file (before the closing `});` of the outer describe, or as a new describe):

```ts
describe("Tracker [token] page card layout", () => {
  it("renders an export link with download attribute", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("export");
    expect(markup).toContain("download");
  });

  it("renders an inline add-target form", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain('name="keyword"');
    expect(markup).toContain('name="domain"');
  });

  it("renders empty state text when no targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      targets: [],
      email: "user@example.com",
    });
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Henüz takip edilen anahtar kelime yok");
  });

  it("renders an h2 for each target card when targets exist", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      targets: [
        {
          id: randomUUID(),
          keyword: "seo test",
          domain: "test.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 5, checkedAt: "2026-07-31T03:00:00.000Z", topCompetitors: [] },
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
      email: "user@example.com",
    });
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("seo test");
    expect(countTag(markup, "h2")).toBeGreaterThanOrEqual(1);
    // Still only one h1
    expect(countTag(markup, "h1")).toBe(1);
  });
});
```

Also update the existing test that checks for the "Yeni Hedef Ekle" link block — that block is replaced by the inline form. Find:

```ts
  it("/tracker/[token] page renders one main landmark with id=main and one h1", async () => {
```

This test should still pass. But if there's a test that checks for the "takip formuna gidin" link, remove or update it. Search for any test mentioning "takip formuna" — if none exists in the test file, no change needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-pages`
Expected: FAIL — new tests fail because the page doesn't render export link, inline form, or card layout yet

- [ ] **Step 3: Restructure the page**

Replace the entire content of `apps/web/app/tracker/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
import { TrackerTargetCard } from "../../../src/components/tracker/tracker-target-card";
import { AddTargetForm } from "../../../src/components/tracker/add-target-form";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return {
    title: "Takip Paneli - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function TrackerTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) notFound();

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    notFound();
  }

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Takip Panelim
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Anahtar kelimeleriniz günlük olarak kontrol edilir. Bu sayfayı yer
              imlerine ekleyerek tekrar erişebilirsiniz.
            </p>
          </div>
          {result.targets.length > 0 && (
            <a
              href={`/tracker/${token}/export`}
              download
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
            >
              CSV İndir
            </a>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-600">
            Hesap: <span className="font-mono font-medium text-slate-800">{result.email}</span>
          </p>
        </div>

        <AddTargetForm token={token} />

        {result.targets.length === 0 ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-slate-600">
              Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {result.targets.map((target) => (
              <TrackerTargetCard key={target.id} target={target} token={token} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Delete the old tracker-dashboard.tsx**

Delete `apps/web/src/components/tracker/tracker-dashboard.tsx`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-pages`
Expected: PASS (all page tests including new card layout tests)

- [ ] **Step 6: Run full web test suite**

Run: `pnpm --filter @seovista/web test`
Expected: PASS (all tests — verify no regressions from tracker-dashboard deletion)

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/tracker/[token]/page.tsx apps/web/src/__tests__/tracker-pages.test.ts
git rm apps/web/src/components/tracker/tracker-dashboard.tsx
git commit -m "feat(tracker): restructure /tracker/[token] to RSC card layout with export link

- Replace TrackerDashboard table with TrackerTargetCard list
- Add inline AddTargetForm (replaces 'go to /tracker' link)
- Add CSV export link in header
- Delete tracker-dashboard.tsx (monolithic client component)"
```

---

### Task 9: CSV Export Route Handler

**Files:**
- Create: `apps/web/app/tracker/[token]/export/route.ts`
- Create: `apps/web/src/__tests__/tracker-export-route.test.ts`

**Interfaces:**
- Consumes: `listTrackerTargetsAction` from existing actions (returns targets with 90 observations each after Task 1), `TargetWithObservations` type from `@seovista/worker`
- Produces: `GET /tracker/{token}/export` → `Response` with `text/csv; charset=utf-8` body (semicolon-delimited, UTF-8 BOM, long format). 404 for invalid/unknown tokens.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/__tests__/tracker-export-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";

const mockListTrackerTargets = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  listTrackerTargetsAction: mockListTrackerTargets,
}));

let GET: (request: Request, context: { params: Promise<{ token: string }> }) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../../app/tracker/[token]/export/route");
  GET = mod.GET;
});

describe("CSV Export Route", () => {
  it("returns 404 for malformed token", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "not-a-uuid" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown token", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: false,
      error: "Takip paneli bulunamadı.",
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  it("returns CSV with BOM and semicolon header for valid token with targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo denetimi",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 5, checkedAt: "2026-07-31T03:00:00.000Z", topCompetitors: [{ rank: 1, domain: "rival.com" }] },
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [{ rank: 1, domain: "rival.com" }] },
          ],
        },
      ],
    });
    const token = randomUUID();
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");

    const text = await res.text();
    // BOM present
    expect(text.charCodeAt(0)).toBe(0xfeff);
    // Semicolon-delimited header
    expect(text).toContain("keyword;domain;date;position;top_competitors");
    // Data rows
    expect(text).toContain("seo denetimi;example.com");
    expect(text).toContain(";5;");
    expect(text).toContain(";3;");
    // top_competitors in comma-separated format
    expect(text).toContain("rival.com(#1)");
  });

  it("returns CSV with header only for valid token with no targets", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("keyword;domain;date;position;top_competitors");
    // Only header + BOM, no data rows
    const lines = text.split("\n");
    expect(lines.length).toBe(2); // header + trailing newline
  });

  it("escapes keyword containing semicolon with double quotes", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo;denetimi",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 3,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 3, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const text = await res.text();
    expect(text).toContain('"seo;denetimi"');
  });

  it("includes Content-Disposition with date-stamped filename", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain(".csv");
  });

  it("renders position=0 as raw 0 in the position column", async () => {
    mockListTrackerTargets.mockResolvedValueOnce({
      success: true,
      email: "user@example.com",
      targets: [
        {
          id: randomUUID(),
          keyword: "seo",
          domain: "example.com",
          locale: "tr-TR",
          active: true,
          createdAt: new Date("2026-07-01"),
          lastCheckedAt: new Date("2026-08-01"),
          latestPosition: 0,
          latestCheckedAt: "2026-08-01T03:00:00.000Z",
          recentObservations: [
            { position: 0, checkedAt: "2026-08-01T03:00:00.000Z", topCompetitors: [] },
          ],
        },
      ],
    });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: randomUUID() }),
    });
    const text = await res.text();
    // The position column should contain 0, not "İlk 10'da yok"
    expect(text).toContain(";0;");
    expect(text).not.toContain("İlk 10'da yok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-export-route`
Expected: FAIL — `Cannot find module '../../app/tracker/[token]/export/route'`

- [ ] **Step 3: Implement the CSV export route**

Create `apps/web/app/tracker/[token]/export/route.ts`:

```ts
import { listTrackerTargetsAction } from "../../../../src/lib/tracker/actions";
import type { TargetWithObservations } from "@seovista/worker";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CSV_HEADER = "keyword;domain;date;position;top_competitors";
const BOM = "\uFEFF";

function escapeCsvField(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function buildCsv(targets: TargetWithObservations[]): string {
  const rows: string[] = [CSV_HEADER];

  for (const target of targets) {
    // Observations are DESC from the repository; reverse to ASC for chronological CSV
    const obs = [...target.recentObservations].reverse();
    for (const o of obs) {
      const date = formatDate(o.checkedAt);
      const position = String(o.position);
      const competitors = o.topCompetitors
        .map((c) => `${c.domain}(#${c.rank})`)
        .join(",");
      rows.push(
        [
          escapeCsvField(target.keyword),
          escapeCsvField(target.domain),
          date,
          position,
          competitors,
        ].join(";"),
      );
    }
  }

  return BOM + rows.join("\n") + "\n";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return new Response(null, { status: 404 });
  }

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    return new Response(null, { status: 404 });
  }

  const csv = buildCsv(result.targets);
  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seovista-takip-${dateStr}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
```

Note: The `topCompetitors` field is available on `recentObservations` because Task 1 already extended the type and query. No repository changes in this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- --reporter=verbose tracker-export-route`
Expected: PASS (7 tests)

Note: The worker must be built before web typecheck since the web imports `TargetWithObservations` from `@seovista/worker`. The worker's `pretest` script handles this, but if only running web tests, run `pnpm --filter @seovista/worker build` first.

- [ ] **Step 5: Run full web test suite**

Run: `pnpm --filter @seovista/web test`
Expected: PASS (all web tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @seovista/web typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/tracker/[token]/export/route.ts apps/web/src/__tests__/tracker-export-route.test.ts
git commit -m "feat(tracker): add CSV export route handler

- Route handler GET /tracker/[token]/export returns text/csv
- Semicolon-delimited + UTF-8 BOM for Turkish Excel compatibility
- Long format: keyword;domain;date;position;top_competitors
- 404 for invalid/unknown tokens
- Field escaping for keywords containing semicolons"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

1. **Spec coverage:** Every spec section maps to a task:
   - §1 Scope → all tasks
   - §2 Architecture → Tasks 4-8
   - §3 TrendChart → Task 4
   - §4 Card layout & inline form → Tasks 5-8
   - §5 CSV export → Task 9
   - §6 New server action → Task 3
   - §7 Repository changes → Task 1
   - §8 Error handling → Tasks 3, 8, 9
   - §9 Testing strategy → all tasks
   - §10 Honest content rules → all tasks
   - §11 Out of scope → respected (no delta badges, no detail view, no alerts)

2. **Placeholder scan:** No TBD, TODO, or "implement later" in the plan.

3. **Type consistency:** `TrackerSessionTargetActionState` (Task 3) matches usage in Task 6. `TargetWithObservations.recentObservations` type extended in Task 1 (adds `topCompetitors`) is consistent across all consumers (Tasks 4, 7, 8, 9). `TrendChartProps` (Task 4) accepts the narrower `{ position, checkedAt }` shape — structurally compatible with the richer type. All mock data in Tasks 7, 8, 9 includes `topCompetitors` in `recentObservations`.

4. **Final verification:**
   - `pnpm --filter @seovista/web test` — all pass
   - `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH=...; pnpm --filter @seovista/worker test` — all pass
   - `pnpm --filter @seovista/web typecheck` — 0 errors
   - `pnpm --filter @seovista/worker typecheck` — 0 errors
   - `git log --oneline` — 9 commits, one per task
