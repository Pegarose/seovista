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
    expect(targets[0]!.recentObservations[0]!.topCompetitors).toHaveLength(2);
    expect(targets[0]!.recentObservations[0]!.topCompetitors[0]!.domain).toBe("rival1.com");
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
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "entered_top10", fromPosition: 0, toPosition: 1, observedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) });
    await repo.insertAlert({ targetId: target.id, sessionId: session.id, kind: "significant_rise", fromPosition: 5, toPosition: 2, observedAt: new Date() });
    // Retention uses `created_at`, not `observed_at`, so artificially age the first alert.
    await env.db.query(
      `UPDATE tracker_alerts SET created_at = now() - make_interval(days => 120) WHERE target_id = $1 AND kind = 'entered_top10'`,
      [target.id],
    );
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
});
