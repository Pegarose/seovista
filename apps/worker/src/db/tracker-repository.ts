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
  recentObservations: Array<{ position: number; checkedAt: string; topCompetitors: Array<{ rank: number; domain: string }> }>;
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
        const obsRes = await client.query<{ position: number; checked_at: Date; top_competitors: unknown }>(
          `SELECT position, checked_at, top_competitors FROM rank_observations
           WHERE target_id = $1 ORDER BY checked_at DESC LIMIT 90`,
          [row.id],
        );
        const recentObs = obsRes.rows.map((o) => ({
          position: o.position,
          checkedAt: o.checked_at.toISOString(),
          topCompetitors: o.top_competitors as Array<{ rank: number; domain: string }>,
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
