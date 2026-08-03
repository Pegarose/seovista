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

