# Tier B B1 — Recurring Rank Tracker (Storage + Scheduler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage layer, daily batch scheduler, and minimal tracker UI for recurring keyword rank tracking — the first vertical slice (B1) of Tier B.

**Architecture:** Three new Postgres tables (`tracker_sessions`, `keyword_targets`, `rank_observations`) store tracking targets and time-series observations. A single daily BullMQ repeatable batch job iterates all active targets, reuses the existing SearXNG SERP provider from Tier A, and records position observations. On the web side, anonymous-email auth with a bookmarkable token URL gives users access to their tracker dashboard. A "takip et" button on the keyword-rank-checker result page provides a natural entry point.

**Tech Stack:** TypeScript strict, Node 24, pnpm 10.30.1, PostgreSQL (pg), BullMQ (ioredis), Next.js App Router (RSC + Client Components), Zod, Vitest.

## Global Constraints

- TypeScript strict mode (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
- pnpm exclusively; Node 24 LTS, pnpm@10.30.1.
- Server Components by default; Client Components only for genuine browser interaction.
- Every page must have exactly one `<h1>` inside exactly one `<main id="main">` landmark.
- Public canonical URLs from `NEXT_PUBLIC_SITE_URL` only, never from request headers.
- Server-only env vars must not be importable by client code.
- Never fabricate metrics, rankings, or results. SERP data is real (SearXNG or honestly-labeled mock).
- Turkish UI text throughout.
- Ports: web 3200, PostgreSQL 8543, Redis 8637.
- Worker tests require `SEOVISTA_LIFECYCLE_CONTEXT_PATH` env pointing to the dev lifecycle context JSON.
- `crypto.randomUUID()` for all UUID generation (Node 24 built-in).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/worker/migrations/015_create_tracker_tables.sql` | DDL for `tracker_sessions`, `keyword_targets`, `rank_observations` |
| `apps/worker/src/db/tracker-repository.ts` | DB CRUD: session lookup/create, target insert/list/deactivate, observation insert, active targets query |
| `apps/worker/src/processors/tracker-scan.ts` | Batch scan logic: iterate active targets → SearXNG → parse → insert observations |
| `apps/worker/src/queue/tracker-scan-submission.ts` | BullMQ queue name constants + repeatable job registration |
| `apps/worker/src/queue/tracker-scan-worker.ts` | BullMQ worker: processes batch jobs, creates job_records for auditability |
| `apps/web/src/lib/tracker/validation.ts` | Zod schemas for tracker form inputs |
| `apps/web/src/lib/tracker/actions.ts` | Server actions: createTrackerTarget, listTrackerTargets, deactivateTrackerTarget |
| `apps/web/src/components/tracker/tracker-form.tsx` | Client component: email + keyword + domain form, shows token URL on success |
| `apps/web/src/components/tracker/tracker-dashboard.tsx` | Client component: target table, add form, deactivate buttons |
| `apps/web/src/components/tracker/track-this-button.tsx` | Client component: inline "takip et" form for keyword-rank result page |
| `apps/web/app/tracker/page.tsx` | RSC page: standalone tracker form |
| `apps/web/app/tracker/[token]/page.tsx` | RSC page: authenticated tracker dashboard |
| `.env.example` | New tracker env vars documented |

---

## Task 1: Migration 015 — Tracker Tables

**Files:**
- Create: `apps/worker/migrations/015_create_tracker_tables.sql`

**Interfaces:**
- Produces: three tables `tracker_sessions`, `keyword_targets`, `rank_observations` with columns matching the spec's data model. Later tasks rely on these exact column names.

- [ ] **Step 1: Create the migration SQL file**

```sql
-- Migration 015: Tracker tables for Tier B B1 (recurring keyword rank tracking).
-- Three tables: tracker_sessions (email → token auth), keyword_targets
-- (tracking targets per session), rank_observations (time-series position
-- data per target). Reuses the existing gen_random_uuid() function from
-- pgcrypto (enabled in migration 003).

CREATE TABLE tracker_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE keyword_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  domain          TEXT NOT NULL,
  locale          TEXT NOT NULL DEFAULT 'tr-TR',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  UNIQUE(session_id, keyword, domain, locale)
);

CREATE TABLE rank_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id       UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  top_competitors JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_keyword_targets_active ON keyword_targets(active) WHERE active = true;
CREATE INDEX idx_rank_obs_target_checked ON rank_observations(target_id, checked_at DESC);
```

- [ ] **Step 2: Verify migration applies cleanly against the dev DB**

Run:
```powershell
$env:DATABASE_URL = (Get-Content apps/worker/.env 2>$null | Select-String 'DATABASE_URL=' | Select-Object -First 1) -replace 'DATABASE_URL=',''
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'postgresql://seovista:seovista@127.0.0.1:8543/seovista_dev_1e623b62a87b' }
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH = 'C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/worker exec node -e "import('./dist/db/index.js').then(async m => { const c = m.createDbClient({ connectionString: process.env.DATABASE_URL, max: 1 }); const r = await m.createMigrationRunner(c, m.defaultMigrationsDir()).applyAll(); console.log('Applied', r.length, 'migrations'); await c.close(); })"
```
Expected: "Applied 1 migrations" (or 0 if already applied — the enhanced runner is idempotent).

- [ ] **Step 3: Verify tables exist**

Run:
```powershell
$env:DATABASE_URL = 'postgresql://seovista:seovista@127.0.0.1:8543/seovista_dev_1e623b62a87b'
pnpm --filter @seovista/worker exec node -e "import('./dist/db/client.js').then(async m => { const c = m.createDbClient({ connectionString: process.env.DATABASE_URL, max: 1 }); const r = await c.query(\"SELECT tablename FROM pg_tables WHERE tablename IN ('tracker_sessions','keyword_targets','rank_observations') ORDER BY tablename\"); console.log(r.rows.map(x => x.tablename)); await c.close(); })"
```
Expected: `[ 'keyword_targets', 'rank_observations', 'tracker_sessions' ]`

- [ ] **Step 4: Commit**

```bash
git add apps/worker/migrations/015_create_tracker_tables.sql
git commit -m "feat(db): migration 015 — tracker tables for Tier B B1

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## Task 2: Tracker Repository

**Files:**
- Create: `apps/worker/src/db/tracker-repository.ts`
- Modify: `apps/worker/src/db/index.ts` (add export)
- Test: `apps/worker/src/__tests__/tracker-repository.test.ts`

**Interfaces:**
- Consumes: `DbClient` from `../db/client.js`
- Produces: `createTrackerRepository(client: DbClient)` → repository object with methods:
  - `findOrCreateSession(email: string): Promise<{ id: string; token: string }>`
  - `createTarget(input: { sessionId: string; keyword: string; domain: string; locale: string }): Promise<{ id: string }>`
  - `countActiveTargets(sessionId: string): Promise<number>`
  - `listActiveTargets(): Promise<ActiveTarget[]>` where `ActiveTarget = { id, sessionId, keyword, domain, locale }`
  - `insertObservation(input: { targetId: string; position: number; topCompetitors: Array<{ rank: number; domain: string }> }): Promise<void>`
  - `updateLastCheckedAt(targetId: string): Promise<void>`
  - `listTargetsByToken(token: string): Promise<TargetWithObservations[]>` where `TargetWithObservations = { id, keyword, domain, locale, active, createdAt, lastCheckedAt, latestPosition: number | null, latestCheckedAt: string | null, recentObservations: Array<{ position: number; checkedAt: string }> }`
  - `deactivateTarget(token: string, targetId: string): Promise<boolean>`
  - `findSessionByToken(token: string): Promise<{ id: string; email: string } | null>`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/tracker-repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TestEnvironment } from "./helpers/test-env.js";
import { setupTestEnvironment } from "./helpers/test-env.js";
import { createTrackerRepository } from "../db/tracker-repository.js";

describe("Tracker Repository", () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await setupTestEnvironment();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it("findOrCreateSession creates a new session for a new email", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    expect(session.id).toBeDefined();
    expect(session.token).toBeDefined();
    expect(session.token).toHaveLength(36); // UUID format
  });

  it("findOrCreateSession returns the same session for the same email", async () => {
    const repo = createTrackerRepository(env.db);
    const s1 = await repo.findOrCreateSession("user@example.com");
    const s2 = await repo.findOrCreateSession("user@example.com");
    expect(s1.id).toBe(s2.id);
    expect(s1.token).toBe(s2.token);
  });

  it("findOrCreateSession returns different sessions for different emails", async () => {
    const repo = createTrackerRepository(env.db);
    const s1 = await repo.findOrCreateSession("a@example.com");
    const s2 = await repo.findOrCreateSession("b@example.com");
    expect(s1.id).not.toBe(s2.id);
  });

  it("createTarget inserts a target and countActiveTargets counts it", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const target = await repo.createTarget({
      sessionId: session.id,
      keyword: "seo denetimi",
      domain: "example.com",
      locale: "tr-TR",
    });
    expect(target.id).toBeDefined();
    const count = await repo.countActiveTargets(session.id);
    expect(count).toBe(1);
  });

  it("createTarget throws on duplicate (same session, keyword, domain, locale)", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    await expect(
      repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" }),
    ).rejects.toThrow();
  });

  it("listActiveTargets returns all active targets across sessions", async () => {
    const repo = createTrackerRepository(env.db);
    const s1 = await repo.findOrCreateSession("a@example.com");
    const s2 = await repo.findOrCreateSession("b@example.com");
    await repo.createTarget({ sessionId: s1.id, keyword: "seo", domain: "a.com", locale: "tr-TR" });
    await repo.createTarget({ sessionId: s2.id, keyword: "sem", domain: "b.com", locale: "tr-TR" });
    const active = await repo.listActiveTargets();
    expect(active).toHaveLength(2);
    expect(active[0]!.keyword).toBeDefined();
  });

  it("insertObservation and updateLastCheckedAt work together", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    await repo.insertObservation({
      targetId: target.id,
      position: 3,
      topCompetitors: [{ rank: 1, domain: "rival1.com" }, { rank: 2, domain: "rival2.com" }],
    });
    await repo.updateLastCheckedAt(target.id);
    const targets = await repo.listTargetsByToken(session.token);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.latestPosition).toBe(3);
    expect(targets[0]!.latestCheckedAt).not.toBeNull();
    expect(targets[0]!.recentObservations).toHaveLength(1);
  });

  it("listTargetsByToken returns empty array for unknown token", async () => {
    const repo = createTrackerRepository(env.db);
    const targets = await repo.listTargetsByToken("nonexistent-token");
    expect(targets).toEqual([]);
  });

  it("deactivateTarget sets active to false and returns true", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    const result = await repo.deactivateTarget(session.token, target.id);
    expect(result).toBe(true);
    const count = await repo.countActiveTargets(session.id);
    expect(count).toBe(0);
  });

  it("deactivateTarget returns false when token does not own the target", async () => {
    const repo = createTrackerRepository(env.db);
    const s1 = await repo.findOrCreateSession("a@example.com");
    const s2 = await repo.findOrCreateSession("b@example.com");
    const target = await repo.createTarget({ sessionId: s1.id, keyword: "seo", domain: "a.com", locale: "tr-TR" });
    const result = await repo.deactivateTarget(s2.token, target.id);
    expect(result).toBe(false);
  });

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

  it("findSessionByToken returns session for valid token", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("user@example.com");
    const found = await repo.findSessionByToken(session.token);
    expect(found).not.toBeNull();
    expect(found!.email).toBe("user@example.com");
  });

  it("findSessionByToken returns null for unknown token", async () => {
    const repo = createTrackerRepository(env.db);
    const found = await repo.findSessionByToken("unknown");
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-repository.test.ts`
Expected: FAIL — `Cannot find module '../db/tracker-repository.js'`

- [ ] **Step 3: Implement the repository**

Create `apps/worker/src/db/tracker-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { DbClient } from "./client.js";

export interface ActiveTarget {
  id: string;
  sessionId: string;
  keyword: string;
  domain: string;
  locale: string;
}

export interface TargetWithObservations {
  id: string;
  keyword: string;
  domain: string;
  locale: string;
  active: boolean;
  createdAt: Date;
  lastCheckedAt: Date | null;
  latestPosition: number | null;
  latestCheckedAt: string | null;
  recentObservations: Array<{ position: number; checkedAt: string }>;
}

export interface SessionInfo {
  id: string;
  email: string;
}

export function createTrackerRepository(client: DbClient) {
  return {
    async findOrCreateSession(email: string): Promise<{ id: string; token: string }> {
      // Try to find an existing session by email first.
      const existing = await client.query<{ id: string; token: string }>(
        `SELECT id, token FROM tracker_sessions WHERE email = $1`,
        [email],
      );
      if (existing.rows[0]) {
        return existing.rows[0];
      }
      // Insert a new session. If a concurrent insert won the race, the
      // UNIQUE(email) constraint will reject ours — fall back to SELECT.
      const token = randomUUID();
      try {
        const res = await client.query<{ id: string; token: string }>(
          `INSERT INTO tracker_sessions (email, token) VALUES ($1, $2) RETURNING id, token`,
          [email, token],
        );
        return res.rows[0]!;
      } catch {
        const retry = await client.query<{ id: string; token: string }>(
          `SELECT id, token FROM tracker_sessions WHERE email = $1`,
          [email],
        );
        return retry.rows[0]!;
      }
    },

    async createTarget(input: {
      sessionId: string;
      keyword: string;
      domain: string;
      locale: string;
    }): Promise<{ id: string }> {
      const res = await client.query<{ id: string }>(
        `INSERT INTO keyword_targets (session_id, keyword, domain, locale)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [input.sessionId, input.keyword, input.domain, input.locale],
      );
      return res.rows[0]!;
    },

    async countActiveTargets(sessionId: string): Promise<number> {
      const res = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM keyword_targets WHERE session_id = $1 AND active = true`,
        [sessionId],
      );
      return parseInt(res.rows[0]!.count, 10);
    },

    async listActiveTargets(): Promise<ActiveTarget[]> {
      const res = await client.query<ActiveTarget>(
        `SELECT id, session_id AS "sessionId", keyword, domain, locale
         FROM keyword_targets WHERE active = true
         ORDER BY last_checked_at NULLS FIRST, created_at ASC`,
      );
      return res.rows;
    },

    async insertObservation(input: {
      targetId: string;
      position: number;
      topCompetitors: Array<{ rank: number; domain: string }>;
    }): Promise<void> {
      await client.query(
        `INSERT INTO rank_observations (target_id, position, top_competitors)
         VALUES ($1, $2, $3::jsonb)`,
        [input.targetId, input.position, JSON.stringify(input.topCompetitors)],
      );
    },

    async updateLastCheckedAt(targetId: string): Promise<void> {
      await client.query(
        `UPDATE keyword_targets SET last_checked_at = now() WHERE id = $1`,
        [targetId],
      );
    },

    async listTargetsByToken(token: string): Promise<TargetWithObservations[]> {
      const targetsRes = await client.query<{
        id: string;
        keyword: string;
        domain: string;
        locale: string;
        active: boolean;
        created_at: Date;
        last_checked_at: Date | null;
      }>(
        `SELECT t.id, t.keyword, t.domain, t.locale, t.active, t.created_at, t.last_checked_at
         FROM keyword_targets t
         JOIN tracker_sessions s ON t.session_id = s.id
         WHERE s.token = $1
         ORDER BY t.created_at DESC`,
        [token],
      );

      if (targetsRes.rows.length === 0) return [];

      const result: TargetWithObservations[] = [];
      for (const row of targetsRes.rows) {
        const obsRes = await client.query<{ position: number; checked_at: Date }>(
          `SELECT position, checked_at FROM rank_observations
           WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 7`,
          [row.id],
        );
        const recentObs = obsRes.rows.map((o) => ({
          position: o.position,
          checkedAt: o.checked_at.toISOString(),
        }));
        result.push({
          id: row.id,
          keyword: row.keyword,
          domain: row.domain,
          locale: row.locale,
          active: row.active,
          createdAt: row.created_at,
          lastCheckedAt: row.last_checked_at,
          latestPosition: recentObs[0]?.position ?? null,
          latestCheckedAt: recentObs[0]?.checkedAt ?? null,
          recentObservations: recentObs,
        });
      }
      return result;
    },

    async deactivateTarget(token: string, targetId: string): Promise<boolean> {
      const res = await client.query(
        `UPDATE keyword_targets t SET active = false
         FROM tracker_sessions s
         WHERE t.session_id = s.id AND s.token = $1 AND t.id = $2 AND t.active = true`,
        [token, targetId],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async findSessionByToken(token: string): Promise<SessionInfo | null> {
      const res = await client.query<SessionInfo>(
        `SELECT id, email FROM tracker_sessions WHERE token = $1`,
        [token],
      );
      return res.rows[0] ?? null;
    },
  };
}
```

- [ ] **Step 4: Add export to db/index.ts**

Add to the end of `apps/worker/src/db/index.ts`:

```typescript
export {
  createTrackerRepository,
  type ActiveTarget,
  type TargetWithObservations,
  type SessionInfo,
} from "./tracker-repository.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-repository.test.ts`
Expected: PASS — all 12 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/db/tracker-repository.ts apps/worker/src/db/index.ts apps/worker/src/__tests__/tracker-repository.test.ts
git commit -m "feat(worker): tracker repository — session/target/observation CRUD

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## Task 3: Tracker Scan Processor

**Files:**
- Create: `apps/worker/src/processors/tracker-scan.ts`
- Test: `apps/worker/src/__tests__/tracker-scan-processor.test.ts`

**Interfaces:**
- Consumes: `SerpProvider` from `../utils/serp-provider.js`, `extractKeywordRank` + `parseSerpEntries` from `@seovista/seo-core`, `createTrackerRepository` from `../db/tracker-repository.js`
- Produces: `processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult>` where:
  - `TrackerScanInput = { db: DbClient; provider: SerpProvider; delayMs?: number }`
  - `TrackerScanResult = { scanned: number; successes: number; failures: number; durationMs: number }`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/tracker-scan-processor.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DbClient } from "../db/client.js";
import type { SerpProvider, SerpEntry } from "../utils/serp-provider.js";

const mockProvider: SerpProvider = {
  source: "mock",
  async search(_keyword: string, _locale: string, domain?: string): Promise<SerpEntry[]> {
    return [
      { position: 1, url: "https://rival.com/", title: "Rival", snippet: "r" },
      { position: 2, url: `https://${domain ?? "target.com"}/`, title: "Target", snippet: "t" },
    ];
  },
};

function createFakeDb(targetRows: Array<{ id: string; sessionId: string; keyword: string; domain: string; locale: string }>): {
  db: DbClient;
  queries: Array<{ sql: string; params?: unknown[] }>;
  insertObservationCalls: Array<{ targetId: string; position: number }>;
  updateLastCheckedCalls: string[];
} {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const insertObservationCalls: Array<{ targetId: string; position: number }> = [];
  const updateLastCheckedCalls: string[] = [];

  const db: DbClient = {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      queries.push({ sql, params });
      // listActiveTargets query
      if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
        return { command: "", rowCount: targetRows.length, oid: 0, fields: [], rows: targetRows as unknown as T[] };
      }
      // INSERT INTO rank_observations
      if (/INSERT INTO rank_observations/i.test(sql)) {
        const targetId = params?.[0] as string;
        const position = params?.[1] as number;
        insertObservationCalls.push({ targetId, position });
        return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
      }
      // UPDATE keyword_targets SET last_checked_at
      if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
        updateLastCheckedCalls.push(params?.[0] as string);
        return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
      }
      return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
    },
    async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> {
      throw new Error("transaction not supported by fake DbClient");
    },
    async close(): Promise<void> {},
  };

  return { db, queries, insertObservationCalls, updateLastCheckedCalls };
}

describe("processTrackerScanBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scans all active targets and records observations", async () => {
    const { createTrackerRepository } = await import("../db/tracker-repository.js");
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");

    const targets = [
      { id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" },
      { id: "t2", sessionId: "s2", keyword: "sem", domain: "b.com", locale: "tr-TR" },
    ];
    const { db, insertObservationCalls, updateLastCheckedCalls } = createFakeDb(targets);

    // Stub the repository methods — the fake db returns the target rows for
    // the listActiveTargets query, and insertObservation/updateLastCheckedAt
    // are captured by the fake db's query handler.
    const result = await processTrackerScanBatch({
      db,
      provider: mockProvider,
      delayMs: 0,
    });

    expect(result.scanned).toBe(2);
    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(insertObservationCalls).toHaveLength(2);
    expect(updateLastCheckedCalls).toHaveLength(2);
    // Position 2 because the mock provider places the target at position 2
    expect(insertObservationCalls[0]!.position).toBe(2);
  });

  it("continues batch when a single target fails", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");

    const failingProvider: SerpProvider = {
      source: "mock",
      async search(keyword: string): Promise<SerpEntry[]> {
        if (keyword === "fail") throw new Error("SERP error");
        return [{ position: 1, url: "https://ok.com/", title: "OK", snippet: "o" }];
      },
    };

    const targets = [
      { id: "t1", sessionId: "s1", keyword: "fail", domain: "a.com", locale: "tr-TR" },
      { id: "t2", sessionId: "s2", keyword: "ok", domain: "b.com", locale: "tr-TR" },
    ];
    const { db, insertObservationCalls } = createFakeDb(targets);

    const result = await processTrackerScanBatch({
      db,
      provider: failingProvider,
      delayMs: 0,
    });

    expect(result.scanned).toBe(2);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(1);
    expect(insertObservationCalls).toHaveLength(1);
    expect(insertObservationCalls[0]!.targetId).toBe("t2");
  });

  it("returns zero counts when no active targets exist", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const { db } = createFakeDb([]);
    const result = await processTrackerScanBatch({ db, provider: mockProvider, delayMs: 0 });
    expect(result.scanned).toBe(0);
    expect(result.successes).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-processor.test.ts`
Expected: FAIL — `Cannot find module '../processors/tracker-scan.js'`

- [ ] **Step 3: Implement the processor**

Create `apps/worker/src/processors/tracker-scan.ts`:

```typescript
import console from "node:console";
import {
  extractKeywordRank,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";
import type { DbClient } from "../db/client.js";
import { createTrackerRepository, type ActiveTarget } from "../db/tracker-repository.js";
import type { SerpProvider } from "../utils/serp-provider.js";

export interface TrackerScanInput {
  db: DbClient;
  provider: SerpProvider;
  /** Delay between SearXNG queries in ms (rate-limit courtesy). Default 2000. */
  delayMs?: number;
}

export interface TrackerScanResult {
  scanned: number;
  successes: number;
  failures: number;
  durationMs: number;
}

const DEFAULT_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a batch tracker scan: iterates all active keyword targets, queries
 * SearXNG for each via the injected SERP provider, extracts the target's
 * position, records a `rank_observations` row, and updates `last_checked_at`.
 *
 * Single-target failures are logged and do not abort the batch. The function
 * returns aggregate counts for operator visibility.
 */
export async function processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult> {
  const { db, provider, delayMs = DEFAULT_DELAY_MS } = input;
  const repo = createTrackerRepository(db);
  const startTime = Date.now();

  const targets: ActiveTarget[] = await repo.listActiveTargets();
  let successes = 0;
  let failures = 0;

  for (const target of targets) {
    try {
      const entries: SerpEntry[] = await provider.search(
        target.keyword,
        target.locale as SerpLocale,
        target.domain,
      );

      const { position, top10 } = extractKeywordRank({
        domain: target.domain,
        entries,
      });

      const topCompetitors = top10.map((entry) => ({
        rank: entry.position,
        domain: extractDomainFromUrl(entry.url),
      }));

      await repo.insertObservation({
        targetId: target.id,
        position: position ?? 0,
        topCompetitors,
      });

      await repo.updateLastCheckedAt(target.id);
      successes++;
    } catch (error) {
      failures++;
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "target_scan_failed",
          targetId: target.id,
          keyword: target.keyword,
          domain: target.domain,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    // Rate-limit courtesy delay between queries (skip after the last target).
    if (delayMs > 0) await sleep(delayMs);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-scan",
      event: "batch_complete",
      scanned: targets.length,
      successes,
      failures,
      durationMs,
      timestamp: new Date().toISOString(),
    }),
  );

  return { scanned: targets.length, successes, failures, durationMs };
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-processor.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/tracker-scan.ts apps/worker/src/__tests__/tracker-scan-processor.test.ts
git commit -m "feat(worker): tracker scan processor — batch SERP scan with per-target error isolation

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## Task 4: Tracker Scan Queue + Worker + Scheduler

**Files:**
- Create: `apps/worker/src/queue/tracker-scan-submission.ts`
- Create: `apps/worker/src/queue/tracker-scan-worker.ts`
- Modify: `apps/worker/src/worker.ts` (add import + start + close)
- Test: `apps/worker/src/__tests__/tracker-scan-submission.test.ts`

**Interfaces:**
- Consumes: `processTrackerScanBatch` from `../processors/tracker-scan.js`, `resolveSerpProvider` from `../utils/serp-provider.js`, BullMQ `Queue` + `Worker`
- Produces:
  - `TRACKER_SCAN_QUEUE_NAME` (string, default `"tracker_scan_jobs"`)
  - `TRACKER_SCAN_JOB_NAME` (string, default `"tracker_scan_batch"`)
  - `TRACKER_SCAN_JOB_RECORD_QUEUE_NAME` (string, `"tracker_scan"`)
  - `registerTrackerScanRepeatable(redisUrl: string): Promise<void>` — registers the daily repeatable job
  - `startTrackerScanWorker(options?: TrackerScanWorkerOptions): Worker` — starts the BullMQ worker
  - `closeTrackerScanSubmissionQueue(): Promise<void>`
  - `__resetTrackerScanSubmissionQueueForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/tracker-scan-submission.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const bullmqState = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add(...args: unknown[]) {
      return bullmqState.add(...args);
    }
    async close(): Promise<void> {}
  },
  Worker: class {
    constructor() {}
    on() { return this; }
    async close(): Promise<void> {}
  },
}));

import {
  registerTrackerScanRepeatable,
  __resetTrackerScanSubmissionQueueForTests,
  TRACKER_SCAN_JOB_NAME,
  TRACKER_SCAN_QUEUE_NAME,
} from "../queue/tracker-scan-submission.js";

const REDIS_URL = "redis://127.0.0.1:8637";

describe("tracker-scan-submission", () => {
  beforeEach(() => {
    bullmqState.add.mockReset();
    __resetTrackerScanSubmissionQueueForTests();
  });

  afterEach(() => {
    __resetTrackerScanSubmissionQueueForTests();
  });

  it("registerTrackerScanRepeatable adds a repeatable job with the cron pattern", async () => {
    bullmqState.add.mockResolvedValue({ id: "repeatable-1" });
    await registerTrackerScanRepeatable(REDIS_URL);

    expect(bullmqState.add).toHaveBeenCalledTimes(1);
    const [jobName, data, opts] = bullmqState.add.mock.calls[0]!;
    expect(jobName).toBe(TRACKER_SCAN_JOB_NAME);
    expect(data).toEqual({});
    expect(opts).toHaveProperty("repeat");
    expect((opts as { repeat: { pattern: string } }).repeat.pattern).toBe("0 3 * * *");
  });

  it("uses the TRACKER_SCAN_CRON env when set", async () => {
    bullmqState.add.mockResolvedValue({ id: "repeatable-2" });
    process.env.TRACKER_SCAN_CRON = "0 5 * * *";
    try {
      await registerTrackerScanRepeatable(REDIS_URL);
      const opts = bullmqState.add.mock.calls[0]![2] as { repeat: { pattern: string } };
      expect(opts.repeat.pattern).toBe("0 5 * * *");
    } finally {
      delete process.env.TRACKER_SCAN_CRON;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-submission.test.ts`
Expected: FAIL — `Cannot find module '../queue/tracker-scan-submission.js'`

- [ ] **Step 3: Implement the submission module**

Create `apps/worker/src/queue/tracker-scan-submission.ts`:

```typescript
import { randomUUID } from "node:crypto";
import console from "node:console";
import { Queue } from "bullmq";

/**
 * Tracker scan submission — registers the daily repeatable batch job that
 * scans all active keyword targets via SearXNG and records rank observations.
 *
 * Unlike the one-off job chains (geo/schema/keyword-rank/crew-report), there
 * is no user-triggered "submit" call. The repeatable job is registered once
 * at worker startup via `registerTrackerScanRepeatable` and fires
 * automatically on the cron schedule.
 */

export const TRACKER_SCAN_QUEUE_NAME = "tracker_scan_jobs";
export const TRACKER_SCAN_JOB_NAME = "tracker_scan_batch";
export const TRACKER_SCAN_JOB_RECORD_QUEUE_NAME = "tracker_scan";

const TRACKER_SCAN_QUEUE_NAME_ENV = "TRACKER_SCAN_QUEUE_NAME";
const TRACKER_SCAN_CRON_ENV = "TRACKER_SCAN_CRON";
const DEFAULT_CRON = "0 3 * * *";

let trackerScanQueue: Queue | null = null;
let trackerScanQueueRedisUrl: string | null = null;

function getTrackerScanQueue(redisUrl: string, queueName: string): Queue {
  if (trackerScanQueue && trackerScanQueueRedisUrl === redisUrl) {
    return trackerScanQueue;
  }
  if (trackerScanQueue) {
    void trackerScanQueue.close().catch(() => undefined);
  }
  trackerScanQueue = new Queue(queueName, { connection: { url: redisUrl } });
  trackerScanQueueRedisUrl = redisUrl;
  return trackerScanQueue;
}

export async function closeTrackerScanSubmissionQueue(): Promise<void> {
  if (trackerScanQueue) {
    await trackerScanQueue.close().catch(() => undefined);
    trackerScanQueue = null;
    trackerScanQueueRedisUrl = null;
  }
}

export function __resetTrackerScanSubmissionQueueForTests(): void {
  trackerScanQueue = null;
  trackerScanQueueRedisUrl = null;
}

function resolveQueueName(): string {
  return process.env[TRACKER_SCAN_QUEUE_NAME_ENV] ?? TRACKER_SCAN_QUEUE_NAME;
}

function resolveCronPattern(): string {
  return process.env[TRACKER_SCAN_CRON_ENV] ?? DEFAULT_CRON;
}

/**
 * Registers the daily repeatable batch job. BullMQ deduplicates repeatable
 * jobs by their repeat key (job name + pattern), so calling this multiple
 * times with the same pattern is safe — it will not create duplicate
 * schedules.
 */
export async function registerTrackerScanRepeatable(redisUrl: string): Promise<void> {
  const queue = getTrackerScanQueue(redisUrl, resolveQueueName());
  const pattern = resolveCronPattern();

  await queue.add(
    TRACKER_SCAN_JOB_NAME,
    {},
    { repeat: { pattern } },
  );

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-scan-submission",
      event: "repeatable_registered",
      cron: pattern,
      timestamp: new Date().toISOString(),
    }),
  );
}
```

- [ ] **Step 4: Implement the worker**

Create `apps/worker/src/queue/tracker-scan-worker.ts`:

```typescript
import console from "node:console";
import { Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { createDbClient } from "../db/client.js";
import { resolveSerpProvider } from "../utils/serp-provider.js";
import { processTrackerScanBatch } from "../processors/tracker-scan.js";
import {
  TRACKER_SCAN_JOB_NAME,
  TRACKER_SCAN_JOB_RECORD_QUEUE_NAME,
  TRACKER_SCAN_QUEUE_NAME,
} from "./tracker-scan-submission.js";

function parseRedisUrl(redisUrl: string | undefined): { host: string; port: number } {
  if (!redisUrl) return { host: "127.0.0.1", port: 8637 };
  try {
    const url = new URL(redisUrl);
    return { host: url.hostname || "127.0.0.1", port: parseInt(url.port, 10) || 8637 };
  } catch {
    return { host: "127.0.0.1", port: 8637 };
  }
}

export interface TrackerScanWorkerOptions {
  /** Override the BullMQ queue name (tests use unique names). */
  queueName?: string;
  /** Override concurrency (batch is sequential, default 1). */
  concurrency?: number;
  /** Injected SERP provider override (tests pass a mock). */
  provider?: import("../utils/serp-provider.js").SerpProvider;
}

export function startTrackerScanWorker(options?: TrackerScanWorkerOptions) {
  const connection = parseRedisUrl(process.env.REDIS_URL);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start tracker scan worker");
  }

  const db = createDbClient({ connectionString: process.env.DATABASE_URL, max: 2 });

  const worker = new Worker(
    options?.queueName ?? process.env.TRACKER_SCAN_QUEUE_NAME ?? TRACKER_SCAN_QUEUE_NAME,
    async (_job: Job) => {
      // Create a job_records row for operator auditability.
      const jobId = randomUUID();
      const jobIdentity = randomUUID();
      const correlationId = randomUUID();

      await db.query(
        `INSERT INTO job_records (id, job_identity, queue_name, correlation_id, target, status)
         VALUES ($1, $2, $3, $4, 'batch', 'running')`,
        [jobId, jobIdentity, TRACKER_SCAN_JOB_RECORD_QUEUE_NAME, correlationId],
      );

      try {
        const provider = options?.provider ?? resolveSerpProvider();
        const delayMs = Number(process.env.TRACKER_SCAN_DELAY_MS) || 2000;

        const result = await processTrackerScanBatch({ db, provider, delayMs });

        // Store the batch summary in job_results for auditability.
        await db.query(
          `INSERT INTO job_results (correlation_id, job_identity, result_type, payload)
           VALUES ($1, $2, 'tracker-scan:result', $3)`,
          [correlationId, jobIdentity, JSON.stringify({ kind: "tracker-scan", ...result })],
        );

        await db.query(
          `UPDATE job_records SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1`,
          [jobId],
        );
      } catch (error) {
        await db.query(
          `UPDATE job_records SET status = 'failed', updated_at = now() WHERE id = $1`,
          [jobId],
        );
        throw error;
      }
    },
    { connection, autorun: true, concurrency: options?.concurrency ?? 1 },
  );

  worker.on("closed", () => {
    db.close().catch(console.error);
  });

  return worker;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-submission.test.ts`
Expected: PASS — all 2 tests pass.

- [ ] **Step 6: Wire into worker.ts**

In `apps/worker/src/worker.ts`, add the import after the crew report worker import (line 11):

```typescript
import { startTrackerScanWorker } from "./queue/tracker-scan-worker.js";
import { registerTrackerScanRepeatable, closeTrackerScanSubmissionQueue } from "./queue/tracker-scan-submission.js";
```

Add to the `RunningWorker` interface (after `crewReportWorker: Worker;`):

```typescript
  trackerScanWorker: Worker;
```

Add after the crew report worker start (after line 78, `const crewReportWorker = startCrewReportWorker();`):

```typescript
  const trackerScanWorker = startTrackerScanWorker();
  // Register the daily repeatable batch job. Safe to call on every startup —
  // BullMQ deduplicates repeatable jobs by their repeat key.
  await registerTrackerScanRepeatable(workerEnv.REDIS_URL);
```

Add to the `running` assignment:

```typescript
  running = { db, queue, worker, geoWorker, schemaWorker, aiCrawlerWorker, keywordRankWorker, crewReportWorker, trackerScanWorker };
```

Add to the shutdown sequence (before `await current.queue.close();`):

```typescript
  await current.trackerScanWorker.close(false);
  await closeTrackerScanSubmissionQueue();
```

- [ ] **Step 7: Run the full worker test suite to check for regressions**

Run: `pnpm --filter @seovista/worker exec vitest run`
Expected: All tests pass (including the 2 new tracker-scan-submission tests). Known acceptable failure: geo-worker 429 (environmental).

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/queue/tracker-scan-submission.ts apps/worker/src/queue/tracker-scan-worker.ts apps/worker/src/worker.ts apps/worker/src/__tests__/tracker-scan-submission.test.ts
git commit -m "feat(worker): tracker scan queue + daily repeatable batch job + worker.ts wiring

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

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

## Task 6: Tracker Pages — /tracker + /tracker/[token]

**Files:**
- Create: `apps/web/src/components/tracker/tracker-form.tsx`
- Create: `apps/web/src/components/tracker/tracker-dashboard.tsx`
- Create: `apps/web/app/tracker/page.tsx`
- Create: `apps/web/app/tracker/[token]/page.tsx`
- Test: `apps/web/src/__tests__/tracker-pages.test.ts`

**Interfaces:**
- Consumes: `createTrackerTargetAction`, `listTrackerTargetsAction`, `deactivateTrackerTargetAction` from `../../src/lib/tracker/actions`
- Produces: two new public routes (`/tracker`, `/tracker/[token]`) and two client components

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/tracker-pages.test.ts`:

```typescript
/**
 * Tracker page contract tests — verifies the /tracker and /tracker/[token]
 * pages render with the correct landmark structure (one <main id="main">,
 * one <h1>) and the expected Turkish UI text.
 *
 * Follows the keyword-rank-result-states.test.ts pattern: async page
 * components are awaited to resolve their RSC promises, then the resulting
 * React element is passed to renderToStaticMarkup.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockListTrackerTargets = vi.fn();

vi.mock("@seovista/worker", () => ({
  createTrackerRepository: vi.fn(),
}));

vi.mock("@/lib/admin/db", () => ({
  getAdminDb: vi.fn(),
}));

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
  listTrackerTargetsAction: mockListTrackerTargets,
  deactivateTrackerTargetAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

const VALID_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let TrackerPage: () => React.ReactElement;
let TrackerTokenPage: (props: { params: Promise<{ token: string }> }) => Promise<React.ReactElement>;

beforeAll(async () => {
  const trackerMod = await import("../app/tracker/page");
  TrackerPage = trackerMod.default;

  const tokenMod = await import("../app/tracker/[token]/page");
  TrackerTokenPage = tokenMod.default;

  // Mock listTrackerTargetsAction to return an empty list by default
  mockListTrackerTargets.mockResolvedValue({ success: true, targets: [], email: "user@example.com" });
});

describe("Tracker pages landmark contract", () => {
  it("/tracker page renders one main landmark with id=main and one h1", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });

  it("/tracker page contains Turkish heading", () => {
    const markup = renderToStaticMarkup(React.createElement(TrackerPage));
    expect(markup).toContain("Anahtar Kelime Takibi");
  });

  it("/tracker/[token] page renders one main landmark with id=main and one h1", async () => {
    const el = await TrackerTokenPage({ params: Promise.resolve({ token: VALID_TOKEN }) });
    const markup = renderToStaticMarkup(el);
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toContain('id="main"');
    expect(countTag(markup, "h1")).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-pages.test.ts`
Expected: FAIL — `Cannot find module '../app/tracker/page'`

- [ ] **Step 3: Implement the tracker form client component**

Create `apps/web/src/components/tracker/tracker-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createTrackerTargetAction, type TrackerTargetActionState } from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackerForm() {
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="tracker-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="tracker-email"
            name="email"
            type="email"
            required
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.email && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="tracker-keyword" className="block text-sm font-medium text-slate-700 mb-1">
            Anahtar Kelime
          </label>
          <input
            id="tracker-keyword"
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
          <label htmlFor="tracker-domain" className="block text-sm font-medium text-slate-700 mb-1">
            Alan Adı
          </label>
          <input
            id="tracker-domain"
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
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>

      {state.status === "success" && state.token && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
          <p className="text-sm font-semibold text-green-800 mb-2">
            Takip hedefiniz eklendi! Günlük olarak kontrol edilecek.
          </p>
          <p className="text-sm text-green-700 mb-2">
            Takip panelinizi görüntülemek için aşağıdaki bağlantıyı yer imine ekleyin:
          </p>
          <a
            href={`/tracker/${state.token}`}
            className="block w-full rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-sm text-green-900 break-all hover:bg-green-50 transition-colors"
          >
            {typeof window !== "undefined" ? `${window.location.origin}/tracker/${state.token}` : `/tracker/${state.token}`}
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement the tracker dashboard client component**

Create `apps/web/src/components/tracker/tracker-dashboard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { deactivateTrackerTargetAction } from "../../lib/tracker/actions";
import type { TargetWithObservations } from "@seovista/worker";

export function TrackerDashboard({
  token,
  targets,
  email,
}: {
  token: string;
  targets: TargetWithObservations[];
  email: string;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleDeactivate(targetId: string) {
    setRemoving(targetId);
    try {
      await deactivateTrackerTargetAction(token, targetId);
      // Reload the page to reflect the change (RSC will re-render)
      window.location.reload();
    } catch {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-600">
          Hesap: <span className="font-mono font-medium text-slate-800">{email}</span>
        </p>
      </div>

      {targets.length === 0 ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
          <p className="text-slate-600">
            Henüz takip edilen anahtar kelime yok. Yukarıdaki formdan yeni bir hedef ekleyebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Takip Edilen Hedefler</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="py-2 pr-4 font-semibold">Anahtar Kelime</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Alan Adı</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Sıra</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son Kontrol</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Son 7 Gözlem</th>
                  <th scope="col" className="py-2 font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-900 font-medium">{target.keyword}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{target.domain}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-700">
                      {target.latestPosition !== null && target.latestPosition > 0
                        ? `#${target.latestPosition}`
                        : target.latestPosition === 0
                        ? "İlk 10'da yok"
                        : "Henüz kontrol edilmedi"}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 text-xs">
                      {target.latestCheckedAt
                        ? new Date(target.latestCheckedAt).toLocaleDateString("tr-TR")
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      {target.recentObservations.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {target.recentObservations.map((obs, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs tabular-nums text-slate-600"
                              title={new Date(obs.checkedAt).toLocaleDateString("tr-TR")}
                            >
                              {obs.position > 0 ? `#${obs.position}` : "—"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Henüz veri yok</span>
                      )}
                    </td>
                    <td className="py-2">
                      {target.active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(target.id)}
                          disabled={removing === target.id}
                          className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {removing === target.id ? "Kaldırılıyor..." : "Kaldır"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement the /tracker page (RSC)**

Create `apps/web/app/tracker/page.tsx`:

```tsx
import { TrackerForm } from "../../src/components/tracker/tracker-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Anahtar Kelime Takibi - SeoVista",
  robots: { index: false, follow: false, nocache: true },
};

export default function TrackerPage() {
  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Anahtar Kelime Takibi
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimenizi günlük olarak otomatik kontrol ettirin. Sıralama
            değişimlerini takip panelinden izleyin.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <TrackerForm />
        </div>

        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-600">
            Takip paneli bağlantınızı kaybederseniz, aynı e-posta ile yeni bir
            hedef eklediğinizde mevcut panelinize erişebilirsiniz.
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Implement the /tracker/[token] page (RSC)**

Create `apps/web/app/tracker/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { listTrackerTargetsAction } from "../../../src/lib/tracker/actions";
import { TrackerDashboard } from "../../../src/components/tracker/tracker-dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Takip Paneli - SeoVista",
    robots: { index: false, follow: false, nocache: true },
  };
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrackerTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    notFound();
  }

  const result = await listTrackerTargetsAction(token);

  if (!result.success) {
    return (
      <main id="main" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-2xl mx-auto w-full text-center">
          <h1 className="text-3xl font-display font-semibold mb-4 text-slate-900">
            Takip Paneli Bulunamadı
          </h1>
          <p className="text-slate-700">
            Takip paneli bağlantınız geçersiz veya bulunamadı. Lütfen bağlantıyı kontrol edin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">
            Takip Panelim
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Anahtar kelimeleriniz günlük olarak kontrol edilir. Bu sayfayı yer
            imlerine ekleyerek tekrar erişebilirsiniz.
          </p>
        </div>

        <TrackerDashboard
          token={token}
          targets={result.targets}
          email={result.email}
        />

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Hedef Ekle</h2>
          <AddTargetForm token={token} email={result.email} />
        </div>
      </div>
    </main>
  );
}

function AddTargetForm({ token: _token, email }: { token: string; email: string }) {
  // Reuses the TrackerForm but pre-fills the email since the session is known.
  // For B1 simplicity, we use a simple form that calls the same action.
  return (
    <form action="/api/tracker/add" method="POST" className="space-y-4">
      <input type="hidden" name="knownEmail" value={email} />
      <p className="text-sm text-slate-600">
        Yeni hedef eklemek için{" "}
        <a href="/tracker" className="font-semibold text-slate-900 hover:text-slate-600 underline">
          takip formuna gidin
        </a>{" "}
        ve aynı e-posta adresini kullanın. Hedefleriniz bu panelde görünecek.
      </p>
    </form>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-pages.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/tracker/tracker-form.tsx apps/web/src/components/tracker/tracker-dashboard.tsx apps/web/app/tracker/page.tsx apps/web/app/tracker/[token]/page.tsx apps/web/src/__tests__/tracker-pages.test.ts
git commit -m "feat(web): tracker pages — /tracker form + /tracker/[token] dashboard

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## Task 7: "Takip Et" Button on Keyword-Rank Result Page

**Files:**
- Create: `apps/web/src/components/tracker/track-this-button.tsx`
- Modify: `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx` (add the button in the completed result branch)
- Test: `apps/web/src/__tests__/tracker-track-this-button.test.ts`

**Interfaces:**
- Consumes: `createTrackerTargetAction` from `@/lib/tracker/actions`
- Produces: `TrackThisButton` client component that takes `{ keyword: string; domain: string }` props and renders an inline email + submit form

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/tracker-track-this-button.test.ts`:

```typescript
/**
 * TrackThisButton contract test — verifies the component renders the
 * "Bu anahtarı takip et" CTA in its initial (collapsed) state.
 * The expanded form with email input is tested via e2e (B1 minimal).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/tracker/actions", () => ({
  createTrackerTargetAction: vi.fn(),
}));

describe("TrackThisButton", () => {
  it("renders the track-this CTA with Turkish text in collapsed state", async () => {
    const { TrackThisButton } = await import("../components/tracker/track-this-button");
    const markup = renderToStaticMarkup(
      React.createElement(TrackThisButton, { keyword: "seo denetimi", domain: "example.com" }),
    );
    expect(markup).toContain("Bu Anahtarı Takip Et");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-track-this-button.test.ts`
Expected: FAIL — `Cannot find module '../components/tracker/track-this-button'`

- [ ] **Step 3: Implement the TrackThisButton component**

Create `apps/web/src/components/tracker/track-this-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createTrackerTargetAction, type TrackerTargetActionState } from "../../lib/tracker/actions";

const initialState: TrackerTargetActionState = { status: "idle" };

export function TrackThisButton({ keyword, domain }: { keyword: string; domain: string }) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createTrackerTargetAction,
    initialState,
  );

  if (state.status === "success" && state.token) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status">
        <p className="text-sm font-semibold text-green-800 mb-2">
          Takibe alındı! Günlük olarak kontrol edilecek.
        </p>
        <a
          href={`/tracker/${state.token}`}
          className="text-sm font-semibold text-green-700 underline hover:text-green-800"
        >
          Takip panelinize gidin →
        </a>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
      >
        Bu Anahtarı Takip Et
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">
        Bu anahtarı günlük takibe alın
      </p>
      <p className="text-xs text-slate-600">
        Anahtar kelime: <span className="font-medium">{keyword}</span> · Alan adı:{" "}
        <span className="font-mono">{domain}</span>
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="keyword" value={keyword} />
        <input type="hidden" name="domain" value={domain} />
        <div>
          <label htmlFor="track-email" className="block text-sm font-medium text-slate-700 mb-1">
            E-posta
          </label>
          <input
            id="track-email"
            name="email"
            type="email"
            required
            placeholder="ornek@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          {state.errors?.email && (
            <p className="mt-1 text-sm text-red-600" role="alert">{state.errors.email[0]}</p>
          )}
        </div>
        {state.errors?.form && (
          <p className="text-sm text-red-600" role="alert">{state.errors.form[0]}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Ekleniyor..." : "Takibe Başla"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the button to the keyword-rank result page**

In `apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx`, add the import at the top (after the CrewReportSection import):

```typescript
import { TrackThisButton } from "../../../../../src/components/tracker/track-this-button";
```

Add the TrackThisButton in the completed result section, after the "İlk 10 Sonuç" table div and before the GEO cross-link div (before the `<div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">` that contains the GEO readiness link):

```tsx
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Günlük Takip</h2>
          <TrackThisButton keyword={safePayload.keyword} domain={safePayload.domain} />
        </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/tracker-track-this-button.test.ts`
Expected: PASS — all 1 test passes.

- [ ] **Step 6: Run keyword-rank result state contract tests to verify no regressions**

Run: `pnpm --filter @seovista/web exec vitest run src/__tests__/keyword-rank-result-states.test.ts`
Expected: PASS — existing landmark contract tests still pass (the new div does not add extra `<main>` or `<h1>` tags; it uses `<h2>`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/tracker/track-this-button.tsx apps/web/app/tools/keyword-rank-checker/result/[jobId]/page.tsx apps/web/src/__tests__/tracker-track-this-button.test.ts
git commit -m "feat(web): 'takip et' button on keyword-rank result page

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## Task 8: .env.example + Full Test Suite

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add tracker env vars to .env.example**

Add the following block at the end of `.env.example` (after the `SEARXNG_BASE_URL=` section):

```
# Tier B B1 — Recurring keyword rank tracker
# Max active tracking targets per email session. Default 5.
TRACKER_MAX_TARGETS_PER_EMAIL=
# Per-IP rate limit for creating tracking targets (per hour). Default 3.
TRACKER_PER_IP_RATE_LIMIT=
# Delay between SearXNG queries in the daily batch scan (ms). Default 2000.
TRACKER_SCAN_DELAY_MS=
# BullMQ queue name for the tracker scan batch job. Default tracker_scan_jobs.
TRACKER_SCAN_QUEUE_NAME=
# Cron pattern for the daily repeatable batch job. Default '0 3 * * *' (daily 03:00 UTC).
TRACKER_SCAN_CRON=
```

- [ ] **Step 2: Run the full worker test suite**

Run: `pnpm --filter @seovista/worker exec vitest run`
Expected: All tests pass. Known acceptable failure: geo-worker 429 (environmental).

- [ ] **Step 3: Run the full web test suite**

Run: `pnpm --filter @seovista/web exec vitest run`
Expected: All tests pass.

- [ ] **Step 4: Run typecheck across the workspace**

Run: `pnpm -r exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Run lint**

Run: `pnpm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "docs: add Tier B B1 tracker env vars to .env.example

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```
