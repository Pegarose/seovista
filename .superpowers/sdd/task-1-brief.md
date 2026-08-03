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

