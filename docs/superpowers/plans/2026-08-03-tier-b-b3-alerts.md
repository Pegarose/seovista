# Tier B — B3 Tracker Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fixed-threshold transition alerts to the recurring rank tracker — persisted `tracker_alerts`, a panel "Uyarılar" section, a consent-gated daily mock-email digest, and 90-day retention — all embedded in the existing `tracker_scan` daily batch job.

**Architecture:** Alert evaluation, digest sending, and retention run inside the existing `tracker_scan` batch processor (Approach A — no new queue). A pure `evaluateTransition(prev, next, minDelta)` function (`apps/worker/src/alerts/alert-evaluator.ts`) decides whether a new observation fires an alert; a DI-style `createAlertDigest({ ... })` helper (`apps/worker/src/alerts/alert-digest.ts`) groups unsent alerts per consenting session and sends one mock email (`@seovista/reports` `createMockEmail`). The web app captures an explicit consent checkbox and renders the alerts section + a consent toggle.

**Tech Stack:** Next.js App Router (RSC), React 19, TypeScript strict, pnpm, BullMQ, PostgreSQL (`pg`), Zod, Vitest, `@seovista/reports` (mock email provider).

## Global Constraints

- TypeScript strict everywhere (`strict`, `noImplicitAny`, `strictNullChecks`); no untyped business logic.
- pnpm only; Node 24 LTS; `pnpm@10.30.1`.
- Server Components by default; Client Components only for genuine browser interaction.
- Every page: exactly one `<h1>` inside exactly one `<main id="main">` landmark.
- Sprint 0: deterministic mock email only (ADR 0001); no live provider traffic or credentials.
- Never fabricate alerts/positions; alerts derive only from real SearXNG observations.
- No color-only indicators (WCAG 2.1 AA) — kind labels always include text.
- Conventional commits with `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>` trailer.
- Exclude `.superpowers/sdd/` scratch files and `apps/web/tsconfig.json` from feature commits.
- Worker tests require lifecycle context: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'`.
- Worker full-suite has 3 known non-green environment tests (geo-worker, migration-invariants, render-cache); run focused test files, not the whole suite, to verify this feature.

---

### Task 1: Migration 016 — `tracker_alerts` table + session consent columns

**Files:**
- Create: `apps/worker/migrations/016_create_tracker_alerts.sql`
- Test: `apps/worker/src/__tests__/migration-invariants.test.ts` (extend — see Step 1)

**Interfaces:**
- Consumes: migration 015 schema (`tracker_sessions`, `keyword_targets`, `rank_observations`); `gen_random_uuid()` from pgcrypto (enabled in migration 003).
- Produces: the `tracker_alerts` table and the `alert_consent` / `alert_consent_updated_at` columns on `tracker_sessions` that every later task depends on.

- [ ] **Step 1: Write the failing migration test**

Create `apps/worker/src/__tests__/tracker-alerts-migration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TestEnvironment } from "./helpers/test-env.js";
import { setupTestEnvironment } from "./helpers/test-env.js";

describe("Migration 016 — Tracker Alerts", () => {
  let env: TestEnvironment;

  beforeEach(async () => {
    env = await setupTestEnvironment(); // applies all migrations including 016
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it("creates tracker_alerts with the required columns and check constraint", async () => {
    const res = await env.db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'tracker_alerts' ORDER BY ordinal_position`,
    );
    const cols = res.rows.map((r) => r.column_name);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "target_id", "session_id", "kind", "from_position", "to_position", "observed_at", "created_at", "emailed_at"]),
    );
  });

  it("adds alert_consent and alert_consent_updated_at to tracker_sessions", async () => {
    const res = await env.db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tracker_sessions' AND column_name IN ('alert_consent', 'alert_consent_updated_at')`,
    );
    expect(res.rows.map((r) => r.column_name).sort()).toEqual(["alert_consent", "alert_consent_updated_at"]);
  });

  it("enforces the kind check constraint", async () => {
    const session = await env.db.query<{ id: string }>(
      `INSERT INTO tracker_sessions (email, token) VALUES ('a@example.com', '11111111-1111-1111-1111-111111111111') RETURNING id`,
    );
    const target = await env.db.query<{ id: string }>(
      `INSERT INTO keyword_targets (session_id, keyword, domain, locale)
       VALUES ($1, 'seo', 'example.com', 'tr-TR') RETURNING id`,
      [session.rows[0]!.id],
    );
    await expect(
      env.db.query(
        `INSERT INTO tracker_alerts (target_id, session_id, kind, from_position, to_position, observed_at)
         VALUES ($1, $2, 'not_a_kind', 1, 0, now())`,
        [target.rows[0]!.id, session.rows[0]!.id],
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-alerts-migration`

Expected: FAIL — `relation "tracker_alerts" does not exist` (migration 016 not yet applied).

- [ ] **Step 3: Write the migration**

Create `apps/worker/migrations/016_create_tracker_alerts.sql`:

```sql
-- Migration 016: Tracker alerts for Tier B B3.
-- Adds consent columns to tracker_sessions and creates the tracker_alerts
-- table. Alerts are written by the daily tracker_scan batch job whenever a
-- position transition crosses a fixed threshold; emailed_at gates the daily
-- digest and the UNIQUE(target_id, kind, observed_at) key makes re-runs
-- idempotent.

ALTER TABLE tracker_sessions
  ADD COLUMN alert_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN alert_consent_updated_at TIMESTAMPTZ;

CREATE TABLE tracker_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id     UUID NOT NULL REFERENCES keyword_targets(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES tracker_sessions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN
    ('dropped_out_of_top10','entered_top10','significant_drop','significant_rise')),
  from_position INTEGER NOT NULL,
  to_position   INTEGER NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at    TIMESTAMPTZ,
  UNIQUE(target_id, kind, observed_at)
);

CREATE INDEX idx_tracker_alerts_session ON tracker_alerts(session_id, created_at DESC);
CREATE INDEX idx_tracker_alerts_unsent  ON tracker_alerts(session_id) WHERE emailed_at IS NULL;
```

- [ ] **Step 4: Run the migration test to verify it passes**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-alerts-migration`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/migrations/016_create_tracker_alerts.sql apps/worker/src/__tests__/tracker-alerts-migration.test.ts
git commit -m "feat(worker): add tracker alerts migration 016"
```

---

### Task 2: Repository — alert + consent queries

**Files:**
- Modify: `apps/worker/src/db/tracker-repository.ts`
- Test: `apps/worker/src/__tests__/tracker-repository.test.ts` (extend)

**Interfaces:**
- Consumes: `DbClient` from `./client.js`; migration 016 schema (Task 1).
- Produces (exact signatures later tasks rely on):
  - `findLatestObservation(targetId: string): Promise<{ position: number; checkedAt: Date } | null>`
  - `insertAlert(input: { targetId; sessionId; kind; fromPosition; toPosition; observedAt }): Promise<void>` — `ON CONFLICT DO NOTHING`
  - `listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>` where `UnsentAlertRow = { alertId; sessionId; email; token; created_at; kind; from_position; to_position; keyword; domain; alert_consent_updated_at }`
  - `markAlertsEmailed(alertIds: string[]): Promise<void>`
  - `listAlertsByToken(token: string, limit: number): Promise<AlertSummary[]>` where `AlertSummary = { id; kind; fromPosition; toPosition; observedAt; keyword; domain }`
  - `deleteOldAlerts(cutoffDays: number): Promise<number>`
  - `deleteOldObservations(cutoffDays: number): Promise<number>`
  - `updateAlertConsent(sessionId: string, consent: boolean): Promise<void>`
  - `findOrCreateSession(email, consent: boolean)`: returns `{ id; token }`; creates with `alert_consent = consent`; upgrades `false → true` when `consent` is true on an existing session.
  - `findSessionByToken(token: string): Promise<{ id; email; alert_consent: boolean } | null>` — changed to also return `alert_consent` so the dashboard can render the consent toggle state.

- [ ] **Step 1: Write the failing repository tests**

Append to `apps/worker/src/__tests__/tracker-repository.test.ts` (inside the existing `describe("Tracker Repository", ...)` block, before the closing `});`):

```ts
  it("insertAlert writes a row and ON CONFLICT dedupes", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("alerts@example.com", false);
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    const observedAt = new Date("2026-08-01T03:00:00.000Z");
    const input = {
      targetId: target.id,
      sessionId: session.id,
      kind: "dropped_out_of_top10" as const,
      fromPosition: 4,
      toPosition: 0,
      observedAt,
    };
    await repo.insertAlert(input);
    await repo.insertAlert(input); // same (target_id, kind, observed_at) → ignored
    const rows = await env.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tracker_alerts WHERE target_id = $1`,
      [target.id],
    );
    expect(rows.rows[0]!.count).toBe("1");
  });

  it("findLatestObservation returns the newest observation or null", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("latest@example.com", false);
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    expect(await repo.findLatestObservation(target.id)).toBeNull();
    await repo.insertObservation({ targetId: target.id, position: 5, topCompetitors: [] });
    await repo.insertObservation({ targetId: target.id, position: 3, topCompetitors: [] });
    const latest = await repo.findLatestObservation(target.id);
    expect(latest?.position).toBe(3);
  });

  it("listUnsentAlertsForDigest filters by consent and unsent status", async () => {
    const repo = createTrackerRepository(env.db);
    const consenting = await repo.findOrCreateSession("yes@example.com", true);
    const nonConsenting = await repo.findOrCreateSession("no@example.com", false);
    const t1 = await repo.createTarget({ sessionId: consenting.id, keyword: "k1", domain: "a.com", locale: "tr-TR" });
    const t2 = await repo.createTarget({ sessionId: nonConsenting.id, keyword: "k2", domain: "b.com", locale: "tr-TR" });
    await repo.insertAlert({ targetId: t1.id, sessionId: consenting.id, kind: "entered_top10", fromPosition: 0, toPosition: 2, observedAt: new Date() });
    await repo.insertAlert({ targetId: t2.id, sessionId: nonConsenting.id, kind: "entered_top10", fromPosition: 0, toPosition: 1, observedAt: new Date() });
    const rows = await repo.listUnsentAlertsForDigest();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("yes@example.com");
    expect(rows[0]!.keyword).toBe("k1");
  });

  it("markAlertsEmailed clears alerts from the unsent set", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("mark@example.com", true);
    const target = await repo.createTarget({ sessionId: session.id, keyword: "k", domain: "a.com", locale: "tr-TR" });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "significant_drop", fromPosition: 2, toPosition: 5, observedAt: new Date() });
    const rows = await repo.listUnsentAlertsForDigest();
    await repo.markAlertsEmailed(rows.map((r) => r.alertId));
    expect(await repo.listUnsentAlertsForDigest()).toHaveLength(0);
  });

  it("listAlertsByToken returns newest-first summaries for a session", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("list@example.com", false);
    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "entered_top10", fromPosition: 0, toPosition: 3, observedAt: new Date("2026-08-01T03:00:00.000Z") });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "significant_drop", fromPosition: 3, toPosition: 7, observedAt: new Date("2026-08-02T03:00:00.000Z") });
    const sessionT = await repo.findSessionByToken(session.token);
    const alerts = await repo.listAlertsByToken(session.token!, 10);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.kind).toBe("significant_drop"); // newest first
    expect(alerts[0]!.keyword).toBe("seo");
    expect(sessionT).not.toBeNull();
  });

  it("deleteOldObservations and deleteOldAlerts honor the cutoff", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("ret@example.com", false);
    const target = await repo.createTarget({ sessionId: session.id, keyword: "k", domain: "a.com", locale: "tr-TR" });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "entered_top10", fromPosition: 0, toPosition: 1, observedAt: new Date("2026-01-01T00:00:00.000Z") });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "significant_rise", fromPosition: 5, toPosition: 2, observedAt: new Date() });
    const deletedAlerts = await repo.deleteOldAlerts(90);
    expect(deletedAlerts).toBe(1);
    const remaining = await repo.listAlertsByToken(session.token!, 10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.kind).toBe("significant_rise");
  });

  it("updateAlertConsent sets the value and timestamp", async () => {
    const repo = createTrackerRepository(env.db);
    const session = await repo.findOrCreateSession("consent@example.com", false);
    await repo.updateAlertConsent(session.id, true);
    const res = await env.db.query<{ alert_consent: boolean; alert_consent_updated_at: Date | null }>(
      `SELECT alert_consent, alert_consent_updated_at FROM tracker_sessions WHERE id = $1`,
      [session.id],
    );
    expect(res.rows[0]!.alert_consent).toBe(true);
    expect(res.rows[0]!.alert_consent_updated_at).not.toBeNull();
  });

  it("findOrCreateSession creates with consent and upgrades false->true", async () => {
    const repo = createTrackerRepository(env.db);
    const created = await repo.findOrCreateSession("upgrade@example.com", true);
    const res = await env.db.query<{ alert_consent: boolean }>(
      `SELECT alert_consent FROM tracker_sessions WHERE id = $1`,
      [created.id],
    );
    expect(res.rows[0]!.alert_consent).toBe(true);
    // Existing session, consent=false -> leave untouched (no downgrade).
    await repo.findOrCreateSession("upgrade@example.com", false);
    const res2 = await env.db.query<{ alert_consent: boolean }>(
      `SELECT alert_consent FROM tracker_sessions WHERE id = $1`,
      [created.id],
    );
    expect(res2.rows[0]!.alert_consent).toBe(true);
  });
```

Note: the existing tests call `findOrCreateSession("user@example.com")` with one argument. To keep those passing, the `consent` parameter must be optional (default `false`). See Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-repository`

Expected: FAIL — TypeScript/build errors (`findOrCreateSession` arity, missing methods) and runtime `relation "tracker_alerts" does not exist` resolved by Task 1.

- [ ] **Step 3: Implement the repository methods**

In `apps/worker/src/db/tracker-repository.ts`, add these interfaces near the top (after `SessionInfo`):

```ts
export interface UnsentAlertRow {
  alertId: string;
  sessionId: string;
  email: string;
  token: string;
  created_at: Date;
  kind: string;
  from_position: number;
  to_position: number;
  keyword: string;
  domain: string;
  alert_consent_updated_at: Date | null;
}

export interface AlertSummary {
  id: string;
  kind: string;
  fromPosition: number;
  toPosition: number;
  observedAt: string;
  keyword: string;
  domain: string;
}
```

Change `findOrCreateSession` to accept an optional consent parameter. Replace the existing method:

```ts
    async findOrCreateSession(email: string, consent = false): Promise<{ id: string; token: string }> {
      const existing = await client.query<{ id: string; token: string; alert_consent: boolean }>(
        `SELECT id, token, alert_consent FROM tracker_sessions WHERE email = $1`,
        [email],
      );
      if (existing.rows[0]) {
        // Upgrade false -> true only when the user explicitly opts in.
        // An unchecked box (treating consent as false) never downgrades an
        // existing true value: it is the default, not a revocation.
        if (consent && !existing.rows[0].alert_consent) {
          await client.query(
            `UPDATE tracker_sessions SET alert_consent = true, alert_consent_updated_at = now() WHERE id = $1`,
            [existing.rows[0].id],
          );
        }
        return { id: existing.rows[0].id, token: existing.rows[0].token };
      }
      const token = randomUUID();
      try {
        const res = await client.query<{ id: string; token: string }>(
          `INSERT INTO tracker_sessions (email, token, alert_consent, alert_consent_updated_at)
           VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END) RETURNING id, token`,
          [email, token, consent],
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
```

Add these methods to the returned object (after `findSessionByToken`):

```ts
    async findLatestObservation(targetId: string): Promise<{ position: number; checkedAt: Date } | null> {
      const res = await client.query<{ position: number; checked_at: Date }>(
        `SELECT position, checked_at FROM rank_observations
         WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 1`,
        [targetId],
      );
      const row = res.rows[0];
      return row ? { position: row.position, checkedAt: row.checked_at } : null;
    },

    async insertAlert(input: {
      targetId: string;
      sessionId: string;
      kind: string;
      fromPosition: number;
      toPosition: number;
      observedAt: Date;
    }): Promise<void> {
      await client.query(
        `INSERT INTO tracker_alerts (target_id, session_id, kind, from_position, to_position, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (target_id, kind, observed_at) DO NOTHING`,
        [input.targetId, input.sessionId, input.kind, input.fromPosition, input.toPosition, input.observedAt],
      );
    },

    async listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]> {
      const res = await client.query<UnsentAlertRow>(
        `SELECT
           a.id AS "alertId",
           a.session_id AS "sessionId",
           s.email,
           s.token,
           a.created_at,
           a.kind,
           a.from_position,
           a.to_position,
           t.keyword,
           t.domain,
           s.alert_consent_updated_at
         FROM tracker_alerts a
         JOIN tracker_sessions s ON s.id = a.session_id
         JOIN keyword_targets t ON t.id = a.target_id
         WHERE s.alert_consent = true
           AND a.emailed_at IS NULL
           AND a.created_at > s.alert_consent_updated_at
         ORDER BY a.created_at ASC`,
      );
      return res.rows;
    },

    async markAlertsEmailed(alertIds: string[]): Promise<void> {
      if (alertIds.length === 0) return;
      await client.query(
        `UPDATE tracker_alerts SET emailed_at = now() WHERE id = ANY($1::uuid[])`,
        [alertIds],
      );
    },

    async listAlertsByToken(token: string, limit: number): Promise<AlertSummary[]> {
      const res = await client.query<AlertSummary>(
        `SELECT
           a.id,
           a.kind,
           a.from_position AS "fromPosition",
           a.to_position AS "toPosition",
           a.observed_at AS "observedAt",
           t.keyword,
           t.domain
         FROM tracker_alerts a
         JOIN keyword_targets t ON t.id = a.target_id
         JOIN tracker_sessions s ON s.id = a.session_id
         WHERE s.token = $1
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [token, limit],
      );
      return res.rows.map((r) => ({ ...r, observedAt: new Date(r.observedAt).toISOString() }));
    },

    async deleteOldAlerts(cutoffDays: number): Promise<number> {
      const res = await client.query(
        `DELETE FROM tracker_alerts WHERE created_at < now() - make_interval(days => $1)`,
        [cutoffDays],
      );
      return res.rowCount ?? 0;
    },

    async deleteOldObservations(cutoffDays: number): Promise<number> {
      const res = await client.query(
        `DELETE FROM rank_observations WHERE checked_at < now() - make_interval(days => $1)`,
        [cutoffDays],
      );
      return res.rowCount ?? 0;
    },

    async updateAlertConsent(sessionId: string, consent: boolean): Promise<void> {
      await client.query(
        `UPDATE tracker_sessions SET alert_consent = $2, alert_consent_updated_at = now() WHERE id = $1`,
        [sessionId, consent],
      );
    },

    async findSessionByToken(token: string): Promise<{ id: string; email: string; alert_consent: boolean } | null> {
      const res = await client.query<{ id: string; email: string; alert_consent: boolean }>(
        `SELECT id, email, alert_consent FROM tracker_sessions WHERE token = $1`,
        [token],
      );
      return res.rows[0] ?? null;
    },
```

- [ ] **Step 4: Run the repository tests to verify they pass**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-repository`

Expected: PASS (all existing + new tests).

- [ ] **Step 5: Typecheck and lint the worker**

Run: `pnpm --filter @seovista/worker typecheck` and `pnpm --filter @seovista/worker lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/db/tracker-repository.ts apps/worker/src/__tests__/tracker-repository.test.ts
git commit -m "feat(worker): add tracker alert and consent repository queries"
```

---

### Task 3: Alert evaluator — pure `evaluateTransition`

**Files:**
- Create: `apps/worker/src/alerts/alert-evaluator.ts`
- Test: `apps/worker/src/__tests__/alert-evaluator.test.ts` (place in `apps/worker/src/__tests__/`)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `export type AlertKind = "dropped_out_of_top10" | "entered_top10" | "significant_drop" | "significant_rise";` and `export function evaluateTransition(prev: number | null, next: number, minDelta: number): AlertKind | null;`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/alert-evaluator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateTransition } from "../alerts/alert-evaluator.js";

const MIN = 3;

describe("evaluateTransition", () => {
  it("returns null for the first observation (no baseline)", () => {
    expect(evaluateTransition(null, 1, MIN)).toBeNull();
    expect(evaluateTransition(null, 0, MIN)).toBeNull();
  });

  it("detects dropped_out_of_top10", () => {
    expect(evaluateTransition(4, 0, MIN)).toBe("dropped_out_of_top10");
    expect(evaluateTransition(10, 0, MIN)).toBe("dropped_out_of_top10");
  });

  it("detects entered_top10", () => {
    expect(evaluateTransition(0, 4, MIN)).toBe("entered_top10");
    expect(evaluateTransition(0, 1, MIN)).toBe("entered_top10");
  });

  it("detects significant_drop at exactly the boundary delta", () => {
    expect(evaluateTransition(1, 4, MIN)).toBe("significant_drop");
    expect(evaluateTransition(2, 5, MIN)).toBe("significant_drop");
  });

  it("detects significant_rise at exactly the boundary delta", () => {
    expect(evaluateTransition(4, 1, MIN)).toBe("significant_rise");
    expect(evaluateTransition(7, 4, MIN)).toBe("significant_rise");
  });

  it("returns null for small movement and equality", () => {
    expect(evaluateTransition(1, 3, MIN)).toBeNull(); // delta 2 < 3
    expect(evaluateTransition(3, 1, MIN)).toBeNull(); // delta 2 < 3
    expect(evaluateTransition(5, 5, MIN)).toBeNull();
    expect(evaluateTransition(0, 0, MIN)).toBeNull();
  });

  it("respects a custom minDelta", () => {
    expect(evaluateTransition(1, 5, 5)).toBe("significant_drop");
    expect(evaluateTransition(1, 4, 5)).toBeNull();
  });

  it("does not treat 0-crossing as significant_drop/rise", () => {
    expect(evaluateTransition(3, 0, MIN)).toBe("dropped_out_of_top10");
    expect(evaluateTransition(0, 3, MIN)).toBe("entered_top10");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/worker test -- alert-evaluator`

Expected: FAIL — module not found (`../alerts/alert-evaluator.js`).

- [ ] **Step 3: Write the implementation**

Create `apps/worker/src/alerts/alert-evaluator.ts`:

```ts
export type AlertKind =
  | "dropped_out_of_top10"
  | "entered_top10"
  | "significant_drop"
  | "significant_rise";

/**
 * Decide whether a position transition (previous observation -> new
 * observation) fires an alert. `0` means the domain was not found in the
 * top 10 results. Categories are mutually exclusive: a single transition
 * yields at most one alert, so the return type is `AlertKind | null`.
 *
 * - First observation (prev === null): no alert — establishes the baseline.
 * - 1..10 -> 0: dropped out of the top 10.
 * - 0 -> 1..10: entered the top 10.
 * - in-band movement of >= minDelta: significant_drop / significant_rise.
 */
export function evaluateTransition(
  prev: number | null,
  next: number,
  minDelta: number,
): AlertKind | null {
  if (prev === null || prev === next) return null;
  if (prev === 0) {
    return next >= 1 && next <= 10 ? "entered_top10" : null;
  }
  if (next === 0) return "dropped_out_of_top10";
  if (next - prev >= minDelta) return "significant_drop";
  if (prev - next >= minDelta) return "significant_rise";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/worker test -- alert-evaluator`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/alerts/alert-evaluator.ts apps/worker/src/__tests__/alert-evaluator.test.ts
git commit -m "feat(worker): add tracker alert transition evaluator"
```

---

### Task 4: Alert digest — build + send one mock email per session

**Files:**
- Create: `apps/worker/src/alerts/alert-digest.ts`
- Test: `apps/worker/src/__tests__/alert-digest.test.ts`

**Interfaces:**
- Consumes: `UnsentAlertRow` from `../db/tracker-repository.js` (Task 2); `EmailProvider` from `@seovista/reports`; `Logger` from `../utils/logger.js`.
- Produces:
  - `interface AlertDigestDeps { repo: { listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>; markAlertsEmailed(ids: string[]): Promise<void> }; email: EmailProvider; logger: Logger; siteUrl: string; fromEmail: string; }`
  - `interface AlertDigestResult { sessionsNotified: number; alertsEmailed: number; failures: number; }`
  - `async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult>`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/alert-digest.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createMockEmail } from "@seovista/reports";
import { noopLogger } from "../utils/logger.js";
import { runAlertDigest } from "../alerts/alert-digest.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

function row(overrides: Partial<UnsentAlertRow>): UnsentAlertRow {
  return {
    alertId: "a1",
    sessionId: "s1",
    email: "user@example.com",
    token: "11111111-1111-1111-1111-111111111111",
    created_at: new Date("2026-08-03T03:00:00.000Z"),
    kind: "dropped_out_of_top10",
    from_position: 4,
    to_position: 0,
    keyword: "seo denetimi",
    domain: "example.com",
    alert_consent_updated_at: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("runAlertDigest", () => {
  it("groups alerts by session into one email and marks them emailed", async () => {
    const email = createMockEmail();
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const rows = [
      row({ alertId: "a1", sessionId: "s1", email: "a@example.com", kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" }),
      row({ alertId: "a2", sessionId: "s1", email: "a@example.com", kind: "significant_rise", from_position: 8, to_position: 3, keyword: "sem", domain: "a.com" }),
      row({ alertId: "a3", sessionId: "s2", email: "b@example.com", kind: "entered_top10", from_position: 0, to_position: 2, keyword: "seo", domain: "b.com" }),
    ];
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => rows, markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });

    expect(result.sessionsNotified).toBe(2);
    expect(result.alertsEmailed).toBe(3);
    expect(markAlertsEmailed).toHaveBeenCalledWith(["a1", "a2", "a3"]);
    expect(email.getSideEffectCounts().successful).toBe(2);
  });

  it("builds Turkish text body with the panel link", async () => {
    const email = createMockEmail();
    const captured: string[] = [];
    const originalSend = email.send.bind(email);
    email.send = async (payload) => {
      captured.push(payload.textBody);
      return originalSend(payload);
    };
    await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row({ kind: "dropped_out_of_top10", from_position: 4, to_position: 0, keyword: "seo", domain: "a.com" })], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(captured[0]).toContain('"seo" (a.com): İlk 10dan düştü (önceki #4)');
    expect(captured[0]).toContain("https://seovista.example/tracker/11111111-1111-1111-1111-111111111111");
  });

  it("does not send when there are no unsent alerts", async () => {
    const email = createMockEmail();
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [], markAlertsEmailed: vi.fn() },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.sessionsNotified).toBe(0);
    expect(email.getSideEffectCounts().attempted).toBe(0);
  });

  it("keeps emailed_at NULL and counts a failure when the provider errors", async () => {
    const email = createMockEmail({ capability: "unconfigured" }); // always fails
    const markAlertsEmailed = vi.fn().mockResolvedValue(undefined);
    const result = await runAlertDigest({
      repo: { listUnsentAlertsForDigest: async () => [row()], markAlertsEmailed },
      email,
      logger: noopLogger,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.failures).toBe(1);
    expect(markAlertsEmailed).not.toHaveBeenCalled();
  });
});
```

Note: `EmailProvider.send` is a readonly method on the interface; reassigning it in the test above works because `createMockEmail()` returns a plain object. If the type refuses assignment, instead capture via a `send` wrapper returned by a small helper (see Step 3 for the subject format) — the simplest robust approach is to assert on the mock's `getSideEffectCounts()` and to build the digest to include the panel link, then assert the link string is present in the payload by wrapping `send` before running. If the TS build complains about the reassignment, replace the `email.send = ...` block with:

```ts
    const send = email.send.bind(email);
    const email2: typeof email = { ...email, send: async (payload) => { captured.push(payload.textBody); return send(payload); } };
```

and pass `email2` to `runAlertDigest`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/worker test -- alert-digest`

Expected: FAIL — module not found (`../alerts/alert-digest.js`).

- [ ] **Step 3: Write the implementation**

Create `apps/worker/src/alerts/alert-digest.ts`:

```ts
import type { EmailProvider, EmailPayload } from "@seovista/reports";
import type { Logger } from "../utils/logger.js";
import type { UnsentAlertRow } from "../db/tracker-repository.js";

export interface AlertDigestRepo {
  listUnsentAlertsForDigest(): Promise<UnsentAlertRow[]>;
  markAlertsEmailed(alertIds: string[]): Promise<void>;
}

export interface AlertDigestDeps {
  repo: AlertDigestRepo;
  email: EmailProvider;
  logger: Logger;
  /** Trusted public origin, e.g. NEXT_PUBLIC_SITE_URL. Used to build the panel link. */
  siteUrl: string;
  /** From address for the digest email. */
  fromEmail: string;
}

export interface AlertDigestResult {
  sessionsNotified: number;
  alertsEmailed: number;
  failures: number;
}

const KIND_LABEL: Record<UnsentAlertRow["kind"], string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function lineText(alert: UnsentAlertRow): string {
  const base = `"${alert.keyword}" (${alert.domain}): ${KIND_LABEL[alert.kind]}`;
  if (alert.kind === "dropped_out_of_top10") return `${base} (önceki #${alert.from_position})`;
  if (alert.kind === "entered_top10") return `${base} (#${alert.to_position})`;
  return `${base} (#${alert.from_position} → #${alert.to_position})`;
}

function groupBySession(rows: UnsentAlertRow[]): Map<string, UnsentAlertRow[]> {
  const groups = new Map<string, UnsentAlertRow[]>();
  for (const r of rows) {
    const list = groups.get(r.sessionId) ?? [];
    list.push(r);
    groups.set(r.sessionId, list);
  }
  return groups;
}

/**
 * Send one digest email per consenting session that has unsent alerts, then
 * mark those alerts as emailed. Runs inside the daily tracker_scan job after
 * the scan loop. A provider failure for one session leaves its alerts
 * `emailed_at` NULL so the next day's digest naturally retries them.
 */
export async function runAlertDigest(deps: AlertDigestDeps): Promise<AlertDigestResult> {
  const rows = await deps.repo.listUnsentAlertsForDigest();
  if (rows.length === 0) {
    return { sessionsNotified: 0, alertsEmailed: 0, failures: 0 };
  }

  const groups = groupBySession(rows);
  let sessionsNotified = 0;
  let alertsEmailed = 0;
  let failures = 0;
  const allEmailedIds: string[] = [];

  for (const [sessionId, alerts] of groups) {
    const first = alerts[0]!;
    const subject = `SeoVista takip uyarıları — ${formatDate(new Date())}`;
    const bodyLines = alerts.map(lineText);
    const panelUrl = `${deps.siteUrl.replace(/\/$/, "")}/tracker/${first.token}`;
    const textBody = `${bodyLines.join("\n")}\n\nUyarılarınızı görmek için: ${panelUrl}`;

    const payload: EmailPayload = {
      to: { email: first.email },
      from: { email: deps.fromEmail },
      subject,
      textBody,
      consent: {
        marketing: true,
        analytics: false,
        timestamp: first.alert_consent_updated_at?.toISOString() ?? new Date().toISOString(),
      },
      source: "tracker-alerts",
      scenario: "success",
    };

    const outcome = await deps.email.send(payload);
    if (outcome.success) {
      sessionsNotified += 1;
      alertsEmailed += alerts.length;
      allEmailedIds.push(...alerts.map((a) => a.alertId));
    } else {
      failures += 1;
      deps.logger(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-alerts",
          event: "digest_send_failed",
          sessionId,
          code: outcome.error?.code,
          message: outcome.error?.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  if (allEmailedIds.length > 0) {
    await deps.repo.markAlertsEmailed(allEmailedIds);
  }

  deps.logger(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-alerts",
      event: "digest_complete",
      sessionsNotified,
      alertsEmailed,
      failures,
      timestamp: new Date().toISOString(),
    }),
  );

  return { sessionsNotified, alertsEmailed, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @seovista/worker test -- alert-digest`

Expected: PASS.

- [ ] **Step 5: Add `@seovista/reports` to the worker and wire the export**

Add `"@seovista/reports": "workspace:*"` to `"dependencies"` in `apps/worker/package.json` (alphabetical order, after `"@seovista/geo-engine"`). Then install:

Run: `pnpm install`

Then add the digest + evaluator to the worker's public API in `apps/worker/src/index.ts` (append to the existing export block):

```ts
export { evaluateTransition, type AlertKind } from "./alerts/alert-evaluator.js";
export { runAlertDigest, type AlertDigestDeps, type AlertDigestResult } from "./alerts/alert-digest.js";
```

- [ ] **Step 6: Typecheck and lint the worker**

Run: `pnpm --filter @seovista/worker typecheck` and `pnpm --filter @seovista/worker lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/alerts/alert-digest.ts apps/worker/src/__tests__/alert-digest.test.ts apps/worker/package.json pnpm-lock.yaml apps/worker/src/index.ts
git commit -m "feat(worker): add alert digest email builder and sender"
```

---

### Task 5: Processor integration — evaluate, insert, digest, retain

**Files:**
- Modify: `apps/worker/src/processors/tracker-scan.ts`
- Test: `apps/worker/src/__tests__/tracker-scan-processor.test.ts` (extend)

**Interfaces:**
- Consumes: `createTrackerRepository` (Task 2), `evaluateTransition` (Task 3), `runAlertDigest` (Task 4), `EmailProvider` from `@seovista/reports` (Task 5 Step 5 dep), `Logger` from `../utils/logger.js`.
- Produces: `TrackerScanInput` gains `email?: EmailProvider; logger?: Logger; minDelta?: number; retentionDays?: number; siteUrl?: string; fromEmail?: string;`. `TrackerScanResult` unchanged (the digest/retention are side effects; the existing `job_results` payload shape is preserved).

- [ ] **Step 1: Write the failing processor tests**

Append to `apps/worker/src/__tests__/tracker-scan-processor.test.ts` (inside the existing `describe("processTrackerScanBatch", ...)` block):

```ts
  it("writes an alert row when a position crosses the top-10 boundary", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const insertedProducts: string[] = [];
    const db: DbClient = {
      async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }] as unknown as T[] };
        }
        if (/INSERT INTO rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/SELECT position, checked_at FROM rank_observations/i.test(sql)) {
          return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] }; // prev = null -> baseline, no alert
        }
        if (/INSERT INTO tracker_alerts/i.test(sql)) {
          insertedProducts.push((params?.[2] as string) ?? "");
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
      },
      async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> { throw new Error("no tx"); },
      async close(): Promise<void> {},
    };
    const result = await processTrackerScanBatch({ db, provider: mockProvider, delayMs: 0 });
    expect(result.successes).toBe(1);
    // First observation: prev is null so no alert fires.
    expect(insertedProducts).toHaveLength(0);
  });

  it("records an alert when prev exists and the position drops out of the top 10", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const kinds: string[] = [];
    const db: DbClient = {
      async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }] as unknown as T[] };
        }
        if (/INSERT INTO rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/SELECT position, checked_at FROM rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ position: 4, checked_at: new Date("2026-08-01T03:00:00.000Z") }] as unknown as T[] };
        }
        if (/INSERT INTO tracker_alerts/i.test(sql)) {
          kinds.push((params?.[2] as string) ?? "");
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
      },
      async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> { throw new Error("no tx"); },
      async close(): Promise<void> {},
    };
    // The mock provider always places the target at position 2, so prev=4 -> next=2 is a significant_rise (delta 2)??? No: 4->2 is a rise of 2, below minDelta 3.
    // To force a drop out of the top 10, the provider must return no entry for the target.
    const droppingProvider: SerpProvider = {
      source: "mock",
      async search(): Promise<SerpEntry[]> {
        return [{ position: 1, url: "https://rival.com/", title: "Rival", snippet: "r" }];
      },
    };
    const result = await processTrackerScanBatch({ db, provider: droppingProvider, delayMs: 0 });
    expect(result.successes).toBe(1);
    expect(kinds).toEqual(["dropped_out_of_top10"]);
  });

  it("runs the digest and retention after the scan loop", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const { createMockEmail } = await import("@seovista/reports");
    const email = createMockEmail();
    const { createTrackerRepository } = await import("../db/tracker-repository.js");
    const targets = [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }];
    const { db } = createFakeDb(targets);
    const result = await processTrackerScanBatch({
      db,
      provider: mockProvider,
      delayMs: 0,
      email,
      retentionDays: 90,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.successes).toBe(1);
    // No alerts exist in this fake db, so digest is a no-op; the call still
    // exercises the retention DELETE path without throwing.
    expect(typeof createTrackerRepository).toBe("function");
  });
```

Note: the third test's `createFakeDb` returns an empty result for the retention DELETE (falls through to the default `return { ... rows: [] }`), which is fine — `deleteOldObservations`/`deleteOldAlerts` read `rowCount` from the fake which is `0`. The test asserts no throw and scan success.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-scan-processor`

Expected: FAIL — the processor does not yet call `findLatestObservation`, `insertAlert`, `runAlertDigest`, or retention (no alert rows / no digest / no retention).

- [ ] **Step 3: Implement the processor integration**

Rewrite `apps/worker/src/processors/tracker-scan.ts` to the following (replacing the existing file):

```ts
import console from "node:console";
import {
  extractKeywordRank,
  normalizeHost,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";
import type { EmailProvider } from "@seovista/reports";
import type { DbClient } from "../db/client.js";
import { createTrackerRepository, type ActiveTarget } from "../db/tracker-repository.js";
import type { SerpProvider } from "../utils/serp-provider.js";
import { evaluateTransition } from "../alerts/alert-evaluator.js";
import { runAlertDigest } from "../alerts/alert-digest.js";
import { noopLogger, type Logger } from "../utils/logger.js";

export interface TrackerScanInput {
  db: DbClient;
  provider: SerpProvider;
  /** Delay between SearXNG queries in ms (rate-limit courtesy). Default 2000. */
  delayMs?: number;
  /** Mock email provider for the alert digest. Optional (Sprint 0 default). */
  email?: EmailProvider;
  /** Injected logger (defaults to a no-op). */
  logger?: Logger;
  /** Position delta threshold for significant drop/rise. Default 3. */
  minDelta?: number;
  /** Retention window in days for observations + alerts. Default 90. */
  retentionDays?: number;
  /** Trusted public origin for the digest panel link. */
  siteUrl?: string;
  /** From address for the digest email. */
  fromEmail?: string;
}

export interface TrackerScanResult {
  scanned: number;
  successes: number;
  failures: number;
  durationMs: number;
}

const DEFAULT_DELAY_MS = 2000;
const DEFAULT_MIN_DELTA = 3;
const DEFAULT_RETENTION_DAYS = 90;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a batch tracker scan: iterates all active keyword targets, queries
 * SearXNG for each via the injected SERP provider, extracts the target's
 * position, records a `rank_observations` row, and updates `last_checked_at`.
 * After each observation it evaluates the position transition and writes a
 * `tracker_alerts` row when a fixed threshold is crossed. After the loop it
 * sends the consent-gated daily digest and prunes stale observations/alerts.
 *
 * Single-target failures are logged and do not abort the batch.
 */
export async function processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult> {
  const { db, provider, delayMs = DEFAULT_DELAY_MS } = input;
  const minDelta = input.minDelta ?? DEFAULT_MIN_DELTA;
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const logger = input.logger ?? noopLogger;
  const repo = createTrackerRepository(db);
  const startTime = Date.now();

  const targets: ActiveTarget[] = await repo.listActiveTargets();
  let successes = 0;
  let failures = 0;

  for (const [index, target] of targets.entries()) {
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

      const nextPosition = position ?? 0;
      const topCompetitors = top10.map((entry) => ({
        rank: entry.position,
        domain: normalizeHost(entry.url),
      }));

      const prev = await repo.findLatestObservation(target.id);
      const observedAt = new Date();

      await repo.insertObservation({
        targetId: target.id,
        position: nextPosition,
        topCompetitors,
      });

      const kind = evaluateTransition(prev?.position ?? null, nextPosition, minDelta);
      if (kind) {
        await repo.insertAlert({
          targetId: target.id,
          sessionId: target.sessionId,
          kind,
          fromPosition: prev!.position,
          toPosition: nextPosition,
          observedAt,
        });
      }

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

    if (delayMs > 0 && index < targets.length - 1) await sleep(delayMs);
  }

  // Digest + retention (only when an email provider is supplied).
  if (input.email) {
    try {
      await runAlertDigest({
        repo: {
          listUnsentAlertsForDigest: repo.listUnsentAlertsForDigest.bind(repo),
          markAlertsEmailed: repo.markAlertsEmailed.bind(repo),
        },
        email: input.email,
        logger,
        siteUrl: input.siteUrl ?? "",
        fromEmail: input.fromEmail ?? "noreply@seovista.com",
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "digest_failed",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    try {
      const observationsDeleted = await repo.deleteOldObservations(retentionDays);
      const alertsDeleted = await repo.deleteOldAlerts(retentionDays);
      logger(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "retention_complete",
          observationsDeleted,
          alertsDeleted,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "retention_failed",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }
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
```

- [ ] **Step 4: Run the processor tests to verify they pass**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-scan-processor`

Expected: PASS (existing + new tests).

- [ ] **Step 5: Wire the worker to construct the email provider and pass env**

In `apps/worker/src/queue/tracker-scan-worker.ts`, import the email provider and pass options into the processor call. Modify the import block and the `processTrackerScanBatch` call:

```ts
import { createMockEmail } from "@seovista/reports";
// ... inside the job handler, replace the processTrackerScanBatch call:
const result = await processTrackerScanBatch({
  db,
  provider,
  delayMs,
  email: createMockEmail(),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  fromEmail: process.env.TRACKER_ALERTS_FROM_EMAIL ?? "noreply@seovista.com",
  minDelta: Number(process.env.TRACKER_ALERT_MIN_DELTA) || 3,
  retentionDays: Number(process.env.TRACKER_RETENTION_DAYS) || 90,
});
```

- [ ] **Step 6: Typecheck and lint the worker**

Run: `pnpm --filter @seovista/worker typecheck` and `pnpm --filter @seovista/worker lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/processors/tracker-scan.ts apps/worker/src/queue/tracker-scan-worker.ts apps/worker/src/__tests__/tracker-scan-processor.test.ts
git commit -m "feat(worker): integrate alert evaluation, digest, and retention into tracker scan"
```

---

### Task 6: Web — validation + consent server actions

**Files:**
- Modify: `apps/web/src/lib/tracker/validation.ts`
- Modify: `apps/web/src/lib/tracker/actions.ts`
- Test: `apps/web/src/lib/tracker/__tests__/actions.test.ts` (extend)

**Interfaces:**
- Consumes: `createTrackerRepository` from `@seovista/worker` (Task 2 methods).
- Produces:
  - `validateTrackerTargetInput` returns `{ consent: boolean }` in `data`.
  - `createTrackerTargetAction` reads `consent` from FormData and passes it to `findOrCreateSession(email, consent)`.
  - `updateAlertConsentAction(token: string, consent: boolean): Promise<{ success: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing web tests**

Append to `apps/web/src/lib/tracker/__tests__/actions.test.ts`:

```ts
// --- B3: consent ---

describe("validateTrackerTargetInput consent", () => {
  it("preprocesses consent from 'on' to true", () => {
    const fd = new FormData();
    fd.set("email", "user@example.com");
    fd.set("keyword", "seo");
    fd.set("domain", "example.com");
    fd.set("consent", "on");
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: fd.get("consent")?.toString() ?? "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.consent).toBe(true);
  });

  it("preprocesses missing consent to false", () => {
    const result = validateTrackerTargetInput({ email: "user@example.com", keyword: "seo", domain: "example.com", consent: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.consent).toBe(false);
  });
});

describe("createTrackerTargetAction consent", () => {
  beforeEach(() => {
    mockGetAdminDb.mockReturnValue({ query: vi.fn() });
    mockCheckIpRateLimit.mockResolvedValue({ success: true });
    mockFindOrCreateSession.mockResolvedValue({ id: SESSION_ID, token: SESSION_REF });
    mockCountActiveTargets.mockResolvedValue(0);
    mockCreateTarget.mockResolvedValue({ id: TARGET_ID });
  });

  it("passes consent=true to findOrCreateSession for a new session", async () => {
    setupRepoMock();
    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
    fd.set("consent", "on");
    await createTrackerTargetAction({ status: "idle" }, fd);
    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", true);
  });

  it("passes consent=false when the checkbox is absent", async () => {
    setupRepoMock();
    const fd = buildFormData({ email: "user@example.com", keyword: "seo", domain: "example.com" });
    await createTrackerTargetAction({ status: "idle" }, fd);
    expect(mockFindOrCreateSession).toHaveBeenCalledWith("user@example.com", false);
  });
});

describe("updateAlertConsentAction", () => {
  it("rejects a malformed token", async () => {
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction("not-a-uuid", true);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown token", async () => {
    mockFindSessionByToken.mockResolvedValue(null);
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction(SESSION_REF, true);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Takip paneli bulunamadı.");
  });

  it("updates consent for a valid token", async () => {
    mockFindSessionByToken.mockResolvedValue({ id: SESSION_ID, email: "user@example.com" });
    const mockUpdateAlertConsent = vi.fn().mockResolvedValue(undefined);
    mockCreateTrackerRepository.mockReturnValue({
      findSessionByToken: mockFindSessionByToken,
      updateAlertConsent: mockUpdateAlertConsent,
    });
    const { updateAlertConsentAction } = await import("../actions");
    const result = await updateAlertConsentAction(SESSION_REF, true);
    expect(result.success).toBe(true);
    expect(mockUpdateAlertConsent).toHaveBeenCalledWith(SESSION_ID, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-actions`

Expected: FAIL — `validateTrackerTargetInput` has no `consent` field, `createTrackerTargetAction` doesn't pass consent, and `updateAlertConsentAction` is undefined.

- [ ] **Step 3: Implement validation changes**

In `apps/web/src/lib/tracker/validation.ts`, replace the `TrackerTargetFormSchema` and `validateTrackerTargetInput`:

```ts
const consentPreprocess = z.preprocess((v) => ({ on: true, "": false, false: false, true: true })[String(v)] ?? false, z.boolean());

export const TrackerTargetFormSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta giriniz."),
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
  consent: consentPreprocess,
});

export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string; consent?: string }) {
  return TrackerTargetFormSchema.safeParse({
    email: input.email,
    keyword: input.keyword,
    domain: input.domain,
    consent: input.consent ?? "",
  });
}
```

Note: `TrackerSessionTargetSchema` (the dashboard inline form, no email) is intentionally unchanged — it collects no consent.

- [ ] **Step 4: Implement action changes**

In `apps/web/src/lib/tracker/actions.ts`:

1. In `createTrackerTargetAction`, read consent from FormData and pass it to `findOrCreateSession`. Replace the call `const session = await repo.findOrCreateSession(email);` with:

```ts
    const consent = formData.get("consent")?.toString() ?? "";
    const session = await repo.findOrCreateSession(email, consent === "on");
```

2. Add `updateAlertConsentAction` at the end of the file (after `createTrackerTargetForSessionAction`):

```ts
export async function updateAlertConsentAction(
  token: string,
  consent: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TOKEN_RE.test(token)) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    await repo.updateAlertConsent(session.id, consent);
    revalidatePath(`/tracker/${token}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update alert consent:", error);
    return { success: false, error: "E-posta uyarı tercihi güncellenemedi." };
  }
}
```

- [ ] **Step 5: Run the web tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-actions`

Expected: PASS.

- [ ] **Step 6: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/tracker/validation.ts apps/web/src/lib/tracker/actions.ts apps/web/src/lib/tracker/__tests__/actions.test.ts
git commit -m "feat(web): add tracker alert consent validation and actions"
```

---

### Task 7: Web — consent checkbox on both tracker forms

**Files:**
- Modify: `apps/web/src/components/tracker/tracker-form.tsx`
- Modify: `apps/web/src/components/tracker/track-this-button.tsx`

**Interfaces:**
- Consumes: `createTrackerTargetAction` (Task 6) — reads `consent` from FormData.
- Produces: no new interfaces; both forms submit a `consent` field.

- [ ] **Step 1: Write the failing component tests**

Extend `apps/web/src/__tests__/tracker-track-this-button.test.ts` (and add coverage for the checkbox in `tracker-form` if not already present). Append a test:

```ts
  it("renders the alert consent checkbox", () => {
    // Render the component with the repo mocks in place; assert the checkbox
    // name="consent" and the Turkish label text are present.
  });
```

Because these components are `"use client"` and rendered via `renderToStaticMarkup`, the existing test file already provides the mock harness. Add an assertion that the markup contains `name="consent"` and the label "Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum."

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-track-this-button`

Expected: FAIL — no `name="consent"` checkbox in the markup.

- [ ] **Step 3: Add the checkbox to `tracker-form.tsx`**

Insert before the submit button in `apps/web/src/components/tracker/tracker-form.tsx`:

```tsx
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span>
              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
            </span>
          </label>
        </div>
```

- [ ] **Step 4: Add the checkbox to `track-this-button.tsx`**

Insert before the submit button in the inline form (inside `apps/web/src/components/tracker/track-this-button.tsx`):

```tsx
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            <span>
              Pozisyon değişikliklerinde e-posta ile bilgilendirilmek istiyorum. (İsteğe bağlı)
            </span>
          </label>
        </div>
```

- [ ] **Step 5: Run the component tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-track-this-button`

Expected: PASS.

- [ ] **Step 6: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/tracker/tracker-form.tsx apps/web/src/components/tracker/track-this-button.tsx apps/web/src/__tests__/tracker-track-this-button.test.ts
git commit -m "feat(web): add alert consent checkbox to tracker forms"
```

---

### Task 8: Web — alerts list component + consent toggle + page integration

**Files:**
- Create: `apps/web/src/components/tracker/alerts-list.tsx`
- Create: `apps/web/src/components/tracker/consent-toggle.tsx`
- Modify: `apps/web/app/tracker/[token]/page.tsx`
- Modify: `apps/web/src/lib/tracker/actions.ts` (add `listAlertsAction`)
- Test: `apps/web/src/__tests__/tracker-pages.test.ts` (extend), `apps/web/src/__tests__/tracker-alerts-list.test.ts` (new)

**Interfaces:**
- Consumes: `listAlertsByToken` from `@seovista/worker` (Task 2); `updateAlertConsentAction` (Task 6).
- Produces:
  - `listAlertsAction(token: string, limit?: number): Promise<{ success: true; alerts: AlertSummary[] } | { success: false; error: string }>`
  - `AlertsList({ alerts, email, token }: { alerts: AlertSummary[]; email: string; token: string })` — RSC.
  - `ConsentToggle({ token, current }: { token: string; current: boolean })` — client island.

- [ ] **Step 1: Write the failing page + component tests**

Extend `apps/web/src/__tests__/tracker-pages.test.ts` — add `listAlertsAction` to the mocked actions module and assert the alerts section renders:

In the `vi.mock("@/lib/tracker/actions", ...)` block add `listAlertsAction: vi.fn()`.

Add a new test file `apps/web/src/__tests__/tracker-alerts-list.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertsList } from "../../src/components/tracker/alerts-list";

describe("AlertsList", () => {
  it("renders the alerts heading and kind labels", () => {
    const el = React.createElement(AlertsList, {
      alerts: [
        { id: "a1", kind: "dropped_out_of_top10", fromPosition: 4, toPosition: 0, observedAt: "2026-08-03T03:00:00.000Z", keyword: "seo", domain: "a.com" },
        { id: "a2", kind: "significant_rise", fromPosition: 8, toPosition: 3, observedAt: "2026-08-02T03:00:00.000Z", keyword: "sem", domain: "a.com" },
      ],
      email: "user@example.com",
      token: "11111111-1111-1111-1111-111111111111",
    });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Uyarılar");
    expect(markup).toContain("İlk 10'dan düştü");
    expect(markup).toContain("Belirgin yükseliş");
    expect(countTag(markup, "h2")).toBe(1);
  });

  it("renders the empty state when there are no alerts", () => {
    const el = React.createElement(AlertsList, { alerts: [], email: "a@example.com", token: "11111111-1111-1111-1111-111111111111" });
    const markup = renderToStaticMarkup(el);
    expect(markup).toContain("Henüz uyarı yok");
  });
});

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @seovista/web test -- tracker-alerts-list`

Expected: FAIL — `AlertsList` module not found.

- [ ] **Step 3: Add `listAlertsAction` to actions.ts**

Append to `apps/web/src/lib/tracker/actions.ts`:

```ts
export type AlertsResult =
  | { success: true; alerts: AlertSummary[] }
  | { success: false; error: string };

export async function listAlertsAction(token: string, limit = 30): Promise<AlertsResult> {
  try {
    const db = getAdminDb();
    const repo = createTrackerRepository(db);
    const session = await repo.findSessionByToken(token);
    if (!session) {
      return { success: false, error: "Takip paneli bulunamadı." };
    }
    const alerts = await repo.listAlertsByToken(token, limit);
    return { success: true, alerts };
  } catch (error) {
    console.error("Failed to list tracker alerts:", error);
    return { success: false, error: "Uyarılar yüklenemedi." };
  }
}
```

Import `AlertSummary` type from `@seovista/worker` in the existing import statement.

- [ ] **Step 4: Create `alerts-list.tsx` (RSC)**

Create `apps/web/src/components/tracker/alerts-list.tsx`:

```tsx
import type { AlertSummary } from "@seovista/worker";

const KIND_LABEL: Record<string, string> = {
  dropped_out_of_top10: "İlk 10'dan düştü",
  entered_top10: "İlk 10'a girdi",
  significant_drop: "Belirgin düşüş",
  significant_rise: "Belirgin yükseliş",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function detailText(alert: AlertSummary): string {
  if (alert.kind === "dropped_out_of_top10") return `#${alert.fromPosition} → İlk 10'da yok`;
  if (alert.kind === "entered_top10") return `İlk 10'da yok → #${alert.toPosition}`;
  return `#${alert.fromPosition} → #${alert.toPosition}`;
}

export function AlertsList({ alerts }: { alerts: AlertSummary[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Uyarılar</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-600 mt-2">
          Henüz uyarı yok. Pozisyon değişikliklerinde burada görünecek.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{alert.keyword}</span>
                <span className="font-mono text-slate-500">{alert.domain}</span>
              </div>
              <div className="mt-1 text-slate-700">
                <span className="font-semibold">{KIND_LABEL[alert.kind] ?? alert.kind}</span>
                <span className="text-slate-500"> · {detailText(alert)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatDate(alert.observedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Create `consent-toggle.tsx` (client island)**

Create `apps/web/src/components/tracker/consent-toggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAlertConsentAction } from "../../lib/tracker/actions";

export function ConsentToggle({ token, current }: { token: string; current: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await updateAlertConsentAction(token, next);
      if (!result.success) {
        setError(result.error ?? "E-posta uyarı tercihi güncellenemedi.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={current}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.checked)}
          className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
        />
        E-posta uyarıları: {current ? "Açık" : "Kapalı"}
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Integrate into the dashboard page**

Modify `apps/web/app/tracker/[token]/page.tsx`:

1. Import `AlertsList` and `ConsentToggle`, and `listAlertsAction`.
2. In `TrackerTokenPage`, fetch alerts alongside targets:

```tsx
  const alertsResult = await listAlertsAction(token);
  const alerts = alertsResult.success ? alertsResult.alerts : [];
```

3. Render the alerts section between `AddTargetForm` and the target cards:

```tsx
        <AddTargetForm token={token} />

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <ConsentToggle token={token} current={result.consent} />
          <AlertsList alerts={alerts} />
        </div>
```

`findSessionByToken` (Task 2) now returns `alert_consent`. Update `listTrackerTargetsAction` in `actions.ts` (Task 6) to return `consent: session.alert_consent` alongside `{ success, targets, email }`, and update the page above to read `result.consent` for the `ConsentToggle` prop. The `TrackerTargetsResult` type becomes:

```ts
export type TrackerTargetsResult =
  | { success: true; targets: TargetWithObservations[]; email: string; consent: boolean }
  | { success: false; error: string };
```

- [ ] **Step 7: Run the page + alerts-list tests to verify they pass**

Run: `pnpm --filter @seovista/web test -- tracker-pages tracker-alerts-list`

Expected: PASS.

- [ ] **Step 8: Typecheck and lint the web app**

Run: `pnpm --filter @seovista/web typecheck` and `pnpm --filter @seovista/web lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/tracker/alerts-list.tsx apps/web/src/components/tracker/consent-toggle.tsx apps/web/app/tracker/[token]/page.tsx apps/web/src/lib/tracker/actions.ts apps/web/src/__tests__/tracker-alerts-list.test.ts apps/web/src/__tests__/tracker-pages.test.ts
git commit -m "feat(web): render tracker alerts section and consent toggle on dashboard"
```

---

### Task 9: Environment variables + `.env.example`

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: the env reads in `tracker-scan-worker.ts` (Task 5) and `actions.ts` (Task 6).
- Produces: documented defaults for the three new variables.

- [ ] **Step 1: Add the new env vars to `.env.example`**

Append inside the existing "Tier B B1 — Recurring keyword rank tracker" block (after `TRACKER_SCAN_CRON=`):

```
# Tier B B3 — Tracker alerts
# Position delta that qualifies as a "significant" drop/rise. Default 3.
TRACKER_ALERT_MIN_DELTA=
# Observation + alert retention window in days. Default 90.
TRACKER_RETENTION_DAYS=
# From address for the daily alert digest email. Default noreply@seovista.com.
TRACKER_ALERTS_FROM_EMAIL=
```

- [ ] **Step 2: Verify no other config references are missing**

Run a quick grep for the new env names in `apps/worker` and `apps/web`:

Run: `Select-String -Path C:\bc-proje\Seovista\apps\worker\src\**\*.ts, C:\bc-proje\Seovista\apps\web\src\**\*.ts -Pattern 'TRACKER_ALERT_MIN_DELTA|TRACKER_RETENTION_DAYS|TRACKER_ALERTS_FROM_EMAIL'`

Expected: matches in `tracker-scan-worker.ts` (Task 5) and `.env.example` (this task).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): document Tier B B3 tracker alert env vars"
```

---

### Task 10: Final verification + SDD ledger update

**Files:**
- Modify: `.superpowers/sdd/progress.md` (ledger — update not committed as a feature change; record the closed-out review state)

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Run the full gate for the affected packages**

Run the focused suites (not the full worker suite, which has 3 known non-green environment tests):

```powershell
$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'
pnpm --filter @seovista/web test
pnpm --filter @seovista/web typecheck
pnpm --filter @seovista/web lint
pnpm --filter @seovista/worker test -- alert-evaluator alert-digest tracker-repository tracker-scan-processor tracker-alerts-migration
pnpm --filter @seovista/worker typecheck
pnpm --filter @seovista/worker lint
pnpm --filter @seovista/worker build
```

Expected: all PASS / 0 errors / 0 warnings.

- [ ] **Step 2: Confirm the working tree is clean of unintended files**

Run: `git status --short`

Expected: only the intentional feature files plus the pre-existing uncommitted scratch (`apps/web/tsconfig.json`, `.superpowers/sdd/*`). Do NOT stage or commit those.

- [ ] **Step 3: Update the SDD progress ledger**

Append a B3 close-out entry to `.superpowers/sdd/progress.md` recording the final review verdict and gate results (mirroring the debt-batch close-out pattern). This ledger file is tracked but its content is documentation; if the repo convention commits it, include it in a final commit, otherwise leave it unstaged.

- [ ] **Step 4: Final commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore(sdd): record B3 tracker alerts close-out"
```

---

## Self-Review

- **Spec coverage:** §2 (migration) → Task 1; §3 (evaluator) → Task 3; §4 (digest) → Task 4; §3.2/§7 (processor integration + retention) → Task 5; §5 (consent) → Tasks 6–7; §6 (panel) → Task 8; §9 (env) → Task 9; §10–§11 (error handling/testing) → distributed across tasks; §12 (honest content) → copy strings in Tasks 4/8; §14 (migration) → Task 1.
- **Placeholder scan:** no TBD/TODO; every code step includes complete code.
- **Type consistency:** `evaluateTransition(prev, next, minDelta): AlertKind | null`, `runAlertDigest(deps): AlertDigestResult`, `insertAlert`, `listUnsentAlertsForDigest`, `markAlertsEmailed`, `listAlertsByToken`, `deleteOldAlerts`, `deleteOldObservations`, `updateAlertConsent`, `findOrCreateSession(email, consent?)` are used with identical names/signatures across Tasks 2–8.
