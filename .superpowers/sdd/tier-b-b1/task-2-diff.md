## Commits
f690d45 feat(worker): tracker repository — session/target/observation CRUD

## Stat
 .../src/__tests__/tracker-repository.test.ts       | 142 +++++++++++++++++
 apps/worker/src/db/index.ts                        |   6 +
 apps/worker/src/db/tracker-repository.ts           | 174 +++++++++++++++++++++
 3 files changed, 322 insertions(+)

## Full Diff
diff --git a/apps/worker/src/__tests__/tracker-repository.test.ts b/apps/worker/src/__tests__/tracker-repository.test.ts
new file mode 100644
index 0000000..9a7788f
--- /dev/null
+++ b/apps/worker/src/__tests__/tracker-repository.test.ts
@@ -0,0 +1,142 @@
+import { describe, it, expect, beforeEach, afterEach } from "vitest";
+import type { TestEnvironment } from "./helpers/test-env.js";
+import { setupTestEnvironment } from "./helpers/test-env.js";
+import { createTrackerRepository } from "../db/tracker-repository.js";
+
+describe("Tracker Repository", () => {
+  let env: TestEnvironment;
+
+  beforeEach(async () => {
+    env = await setupTestEnvironment();
+  });
+
+  afterEach(async () => {
+    await env.cleanup();
+  });
+
+  it("findOrCreateSession creates a new session for a new email", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    expect(session.id).toBeDefined();
+    expect(session.token).toBeDefined();
+    expect(session.token).toHaveLength(36); // UUID format
+  });
+
+  it("findOrCreateSession returns the same session for the same email", async () => {
+    const repo = createTrackerRepository(env.db);
+    const s1 = await repo.findOrCreateSession("user@example.com");
+    const s2 = await repo.findOrCreateSession("user@example.com");
+    expect(s1.id).toBe(s2.id);
+    expect(s1.token).toBe(s2.token);
+  });
+
+  it("findOrCreateSession returns different sessions for different emails", async () => {
+    const repo = createTrackerRepository(env.db);
+    const s1 = await repo.findOrCreateSession("a@example.com");
+    const s2 = await repo.findOrCreateSession("b@example.com");
+    expect(s1.id).not.toBe(s2.id);
+  });
+
+  it("createTarget inserts a target and countActiveTargets counts it", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    const target = await repo.createTarget({
+      sessionId: session.id,
+      keyword: "seo denetimi",
+      domain: "example.com",
+      locale: "tr-TR",
+    });
+    expect(target.id).toBeDefined();
+    const count = await repo.countActiveTargets(session.id);
+    expect(count).toBe(1);
+  });
+
+  it("createTarget throws on duplicate (same session, keyword, domain, locale)", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
+    await expect(
+      repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" }),
+    ).rejects.toThrow();
+  });
+
+  it("listActiveTargets returns all active targets across sessions", async () => {
+    const repo = createTrackerRepository(env.db);
+    const s1 = await repo.findOrCreateSession("a@example.com");
+    const s2 = await repo.findOrCreateSession("b@example.com");
+    await repo.createTarget({ sessionId: s1.id, keyword: "seo", domain: "a.com", locale: "tr-TR" });
+    await repo.createTarget({ sessionId: s2.id, keyword: "sem", domain: "b.com", locale: "tr-TR" });
+    const active = await repo.listActiveTargets();
+    expect(active).toHaveLength(2);
+    expect(active[0]!.keyword).toBeDefined();
+  });
+
+  it("insertObservation and updateLastCheckedAt work together", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
+    await repo.insertObservation({
+      targetId: target.id,
+      position: 3,
+      topCompetitors: [{ rank: 1, domain: "rival1.com" }, { rank: 2, domain: "rival2.com" }],
+    });
+    await repo.updateLastCheckedAt(target.id);
+    const targets = await repo.listTargetsByToken(session.token);
+    expect(targets).toHaveLength(1);
+    expect(targets[0]!.latestPosition).toBe(3);
+    expect(targets[0]!.latestCheckedAt).not.toBeNull();
+    expect(targets[0]!.recentObservations).toHaveLength(1);
+  });
+
+  it("listTargetsByToken returns empty array for unknown token", async () => {
+    const repo = createTrackerRepository(env.db);
+    const targets = await repo.listTargetsByToken("nonexistent-token");
+    expect(targets).toEqual([]);
+  });
+
+  it("deactivateTarget sets active to false and returns true", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
+    const result = await repo.deactivateTarget(session.token, target.id);
+    expect(result).toBe(true);
+    const count = await repo.countActiveTargets(session.id);
+    expect(count).toBe(0);
+  });
+
+  it("deactivateTarget returns false when token does not own the target", async () => {
+    const repo = createTrackerRepository(env.db);
+    const s1 = await repo.findOrCreateSession("a@example.com");
+    const s2 = await repo.findOrCreateSession("b@example.com");
+    const target = await repo.createTarget({ sessionId: s1.id, keyword: "seo", domain: "a.com", locale: "tr-TR" });
+    const result = await repo.deactivateTarget(s2.token, target.id);
+    expect(result).toBe(false);
+  });
+
+  it("listTargetsByToken includes up to 7 recent observations ordered by date desc", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    const target = await repo.createTarget({ sessionId: session.id, keyword: "seo", domain: "example.com", locale: "tr-TR" });
+    for (let i = 1; i <= 10; i++) {
+      await repo.insertObservation({ targetId: target.id, position: i, topCompetitors: [] });
+    }
+    await repo.updateLastCheckedAt(target.id);
+    const targets = await repo.listTargetsByToken(session.token);
+    expect(targets[0]!.recentObservations).toHaveLength(7);
+    expect(targets[0]!.recentObservations[0]!.position).toBe(10); // most recent first
+  });
+
+  it("findSessionByToken returns session for valid token", async () => {
+    const repo = createTrackerRepository(env.db);
+    const session = await repo.findOrCreateSession("user@example.com");
+    const found = await repo.findSessionByToken(session.token);
+    expect(found).not.toBeNull();
+    expect(found!.email).toBe("user@example.com");
+  });
+
+  it("findSessionByToken returns null for unknown token", async () => {
+    const repo = createTrackerRepository(env.db);
+    const found = await repo.findSessionByToken("unknown");
+    expect(found).toBeNull();
+  });
+});
diff --git a/apps/worker/src/db/index.ts b/apps/worker/src/db/index.ts
index 8b61800..222daf5 100644
--- a/apps/worker/src/db/index.ts
+++ b/apps/worker/src/db/index.ts
@@ -62,10 +62,16 @@ export {
 export { readAdminOverview, type AdminOverview, type OverviewDependencyStatus } from "./admin-overview.js";
 export {
   createAdminAuthRepository,
   type AdminUser,
   type AdminSession,
   type AdminSessionWithUser,
   type AdminUserStatus,
   type CreateAdminUser,
   type CreateAdminSession,
 } from "./admin-auth.js";
+export {
+  createTrackerRepository,
+  type ActiveTarget,
+  type TargetWithObservations,
+  type SessionInfo,
+} from "./tracker-repository.js";
diff --git a/apps/worker/src/db/tracker-repository.ts b/apps/worker/src/db/tracker-repository.ts
new file mode 100644
index 0000000..f1371c5
--- /dev/null
+++ b/apps/worker/src/db/tracker-repository.ts
@@ -0,0 +1,174 @@
+import { randomUUID } from "node:crypto";
+import type { DbClient } from "./client.js";
+
+export interface ActiveTarget {
+  id: string;
+  sessionId: string;
+  keyword: string;
+  domain: string;
+  locale: string;
+}
+
+export interface TargetWithObservations {
+  id: string;
+  keyword: string;
+  domain: string;
+  locale: string;
+  active: boolean;
+  createdAt: Date;
+  lastCheckedAt: Date | null;
+  latestPosition: number | null;
+  latestCheckedAt: string | null;
+  recentObservations: Array<{ position: number; checkedAt: string }>;
+}
+
+export interface SessionInfo {
+  id: string;
+  email: string;
+}
+
+export function createTrackerRepository(client: DbClient) {
+  return {
+    async findOrCreateSession(email: string): Promise<{ id: string; token: string }> {
+      // Try to find an existing session by email first.
+      const existing = await client.query<{ id: string; token: string }>(
+        `SELECT id, token FROM tracker_sessions WHERE email = $1`,
+        [email],
+      );
+      if (existing.rows[0]) {
+        return existing.rows[0];
+      }
+      // Insert a new session. If a concurrent insert won the race, the
+      // UNIQUE(email) constraint will reject ours — fall back to SELECT.
+      const token = randomUUID();
+      try {
+        const res = await client.query<{ id: string; token: string }>(
+          `INSERT INTO tracker_sessions (email, token) VALUES ($1, $2) RETURNING id, token`,
+          [email, token],
+        );
+        return res.rows[0]!;
+      } catch {
+        const retry = await client.query<{ id: string; token: string }>(
+          `SELECT id, token FROM tracker_sessions WHERE email = $1`,
+          [email],
+        );
+        return retry.rows[0]!;
+      }
+    },
+
+    async createTarget(input: {
+      sessionId: string;
+      keyword: string;
+      domain: string;
+      locale: string;
+    }): Promise<{ id: string }> {
+      const res = await client.query<{ id: string }>(
+        `INSERT INTO keyword_targets (session_id, keyword, domain, locale)
+         VALUES ($1, $2, $3, $4) RETURNING id`,
+        [input.sessionId, input.keyword, input.domain, input.locale],
+      );
+      return res.rows[0]!;
+    },
+
+    async countActiveTargets(sessionId: string): Promise<number> {
+      const res = await client.query<{ count: string }>(
+        `SELECT COUNT(*)::text AS count FROM keyword_targets WHERE session_id = $1 AND active = true`,
+        [sessionId],
+      );
+      return parseInt(res.rows[0]!.count, 10);
+    },
+
+    async listActiveTargets(): Promise<ActiveTarget[]> {
+      const res = await client.query<ActiveTarget>(
+        `SELECT id, session_id AS "sessionId", keyword, domain, locale
+         FROM keyword_targets WHERE active = true
+         ORDER BY last_checked_at NULLS FIRST, created_at ASC`,
+      );
+      return res.rows;
+    },
+
+    async insertObservation(input: {
+      targetId: string;
+      position: number;
+      topCompetitors: Array<{ rank: number; domain: string }>;
+    }): Promise<void> {
+      await client.query(
+        `INSERT INTO rank_observations (target_id, position, top_competitors)
+         VALUES ($1, $2, $3::jsonb)`,
+        [input.targetId, input.position, JSON.stringify(input.topCompetitors)],
+      );
+    },
+
+    async updateLastCheckedAt(targetId: string): Promise<void> {
+      await client.query(
+        `UPDATE keyword_targets SET last_checked_at = now() WHERE id = $1`,
+        [targetId],
+      );
+    },
+
+    async listTargetsByToken(token: string): Promise<TargetWithObservations[]> {
+      const targetsRes = await client.query<{
+        id: string;
+        keyword: string;
+        domain: string;
+        locale: string;
+        active: boolean;
+        created_at: Date;
+        last_checked_at: Date | null;
+      }>(
+        `SELECT t.id, t.keyword, t.domain, t.locale, t.active, t.created_at, t.last_checked_at
+         FROM keyword_targets t
+         JOIN tracker_sessions s ON t.session_id = s.id
+         WHERE s.token = $1
+         ORDER BY t.created_at DESC`,
+        [token],
+      );
+
+      if (targetsRes.rows.length === 0) return [];
+
+      const result: TargetWithObservations[] = [];
+      for (const row of targetsRes.rows) {
+        const obsRes = await client.query<{ position: number; checked_at: Date }>(
+          `SELECT position, checked_at FROM rank_observations
+           WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 7`,
+          [row.id],
+        );
+        const recentObs = obsRes.rows.map((o) => ({
+          position: o.position,
+          checkedAt: o.checked_at.toISOString(),
+        }));
+        result.push({
+          id: row.id,
+          keyword: row.keyword,
+          domain: row.domain,
+          locale: row.locale,
+          active: row.active,
+          createdAt: row.created_at,
+          lastCheckedAt: row.last_checked_at,
+          latestPosition: recentObs[0]?.position ?? null,
+          latestCheckedAt: recentObs[0]?.checkedAt ?? null,
+          recentObservations: recentObs,
+        });
+      }
+      return result;
+    },
+
+    async deactivateTarget(token: string, targetId: string): Promise<boolean> {
+      const res = await client.query(
+        `UPDATE keyword_targets t SET active = false
+         FROM tracker_sessions s
+         WHERE t.session_id = s.id AND s.token = $1 AND t.id = $2 AND t.active = true`,
+        [token, targetId],
+      );
+      return (res.rowCount ?? 0) > 0;
+    },
+
+    async findSessionByToken(token: string): Promise<SessionInfo | null> {
+      const res = await client.query<SessionInfo>(
+        `SELECT id, email FROM tracker_sessions WHERE token = $1`,
+        [token],
+      );
+      return res.rows[0] ?? null;
+    },
+  };
+}
