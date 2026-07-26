# IP Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce per-IP rate limiting on the public GEO Audit form (`startGeoAuditAction`) using Redis to prevent abuse and credit burn.

**Architecture:** A Redis-backed sliding/fixed window rate limiter in `apps/web/src/lib/geo-checker/rate-limiter.ts` that tracks audit submissions per client IP using `AUDIT_PER_IP_RATE_LIMIT`. Integrates into `startGeoAuditAction()` before lead creation and audit submission.

**Tech Stack:** Next.js App Router (Headers), Redis (`ioredis`), Vitest.

## Global Constraints

- TypeScript strict mode everywhere (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
- Use pnpm exclusively.
- Use `AUDIT_PER_IP_RATE_LIMIT` environment variable from `@seovista/seo-core/env` or `process.env`.
- Fallback IP handling for local dev / direct connections when `x-forwarded-for` is absent.

---

### Task 1: Create IP Helper and Rate Limiter Module with Unit Tests

**Files:**
- Create: `apps/web/src/lib/geo-checker/rate-limiter.ts`
- Create: `apps/web/src/lib/geo-checker/__tests__/rate-limiter.test.ts`

**Interfaces:**
- Produces: `extractClientIp(headers: Headers): string`
- Produces: `checkIpRateLimit(redisUrl: string, ip: string, limit?: number): Promise<{ success: boolean; remaining: number; resetSeconds: number }>`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/geo-checker/__tests__/rate-limiter.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractClientIp, checkIpRateLimit } from "../rate-limiter";

describe("IP Rate Limiter", () => {
  describe("extractClientIp", () => {
    it("extracts IP from x-forwarded-for header (first IP)", () => {
      const headers = new Headers({ "x-forwarded-for": "203.0.113.195, 70.41.3.18" });
      expect(extractClientIp(headers)).toBe("203.0.113.195");
    });

    it("extracts IP from x-real-ip header if x-forwarded-for is missing", () => {
      const headers = new Headers({ "x-real-ip": "198.51.100.1" });
      expect(extractClientIp(headers)).toBe("198.51.100.1");
    });

    it("falls back to 127.0.0.1 when headers are missing", () => {
      const headers = new Headers({});
      expect(extractClientIp(headers)).toBe("127.0.0.1");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web exec vitest run src/components/geo-checker/__tests__/audit-polling.test.ts src/lib/geo-checker/__tests__/rate-limiter.test.ts`
Expected: FAIL with module not found error.

- [ ] **Step 3: Write minimal rate limiter implementation**

Create `apps/web/src/lib/geo-checker/rate-limiter.ts`:
```typescript
import Redis from "ioredis";

export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }

  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetSeconds: number;
}

const DEFAULT_RATE_LIMIT = 10;
const WINDOW_TTL_SECONDS = 3600; // 1 hour window

export async function checkIpRateLimit(
  redisUrl: string,
  ip: string,
  limit: number = DEFAULT_RATE_LIMIT
): Promise<RateLimitResult> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const key = `geo:ratelimit:ip:${ip}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, WINDOW_TTL_SECONDS);
    }
    const ttl = await redis.ttl(key);

    const remaining = Math.max(0, limit - current);
    const success = current <= limit;

    return {
      success,
      remaining,
      resetSeconds: ttl > 0 ? ttl : WINDOW_TTL_SECONDS,
    };
  } finally {
    redis.disconnect();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/lib/geo-checker/__tests__/rate-limiter.test.ts`
Expected: PASS

---

### Task 2: Integrate Rate Limiter into `startGeoAuditAction`

**Files:**
- Modify: `apps/web/src/lib/geo-checker/actions.ts`

- [ ] **Step 1: Write integration check/mock test or inspect `actions.ts`**

Update `apps/web/src/lib/geo-checker/actions.ts` to call `extractClientIp` and `checkIpRateLimit` before lead creation.

- [ ] **Step 2: Update `actions.ts`**

In `startGeoAuditAction`:
```typescript
import { headers } from "next/headers";
import { extractClientIp, checkIpRateLimit } from "./rate-limiter";

// Inside startGeoAuditAction after Zod validation:
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required to submit a geo audit");
}

const reqHeaders = await headers();
const clientIp = extractClientIp(reqHeaders);
const limit = Number(process.env.AUDIT_PER_IP_RATE_LIMIT) || 10;

const rateLimit = await checkIpRateLimit(redisUrl, clientIp, limit);
if (!rateLimit.success) {
  return {
    status: "error",
    errors: {
      form: [`Rate limit exceeded. Maximum ${limit} audits per hour allowed. Please try again later.`],
    },
  };
}
```

- [ ] **Step 3: Run web typecheck & tests**

Run: `pnpm --filter @seovista/web run typecheck && pnpm --filter @seovista/web test`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add apps/web/src/lib/geo-checker/rate-limiter.ts apps/web/src/lib/geo-checker/__tests__/rate-limiter.test.ts apps/web/src/lib/geo-checker/actions.ts
git commit -m "feat(web): add per-IP rate limiting to GEO audit form"
```
