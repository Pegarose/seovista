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
