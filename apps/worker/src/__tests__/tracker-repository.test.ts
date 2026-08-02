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
});
