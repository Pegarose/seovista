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

export function createTrackerRepository(client: DbClient) {
  return {
    async findOrCreateSession(email: string, consent = false): Promise<{ id: string; token: string }> {
      // Try to find an existing session by email first.
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
      // Insert a new session. If a concurrent insert won the race, the
      // UNIQUE(email) constraint will reject ours — fall back to SELECT.
      const token = randomUUID();
      try {
        const res = await client.query<{ id: string; token: string }>(
          `INSERT INTO tracker_sessions (email, token, alert_consent, alert_consent_updated_at)
           VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END) RETURNING id, token`,
          [email, token, consent],
        );
        return res.rows[0]!;
      } catch {
        const retry = await client.query<{ id: string; token: string; alert_consent: boolean }>(
          `SELECT id, token, alert_consent FROM tracker_sessions WHERE email = $1`,
          [email],
        );
        const existing = retry.rows[0]!;
        if (consent && !existing.alert_consent) {
          await client.query(
            `UPDATE tracker_sessions SET alert_consent = true, alert_consent_updated_at = now() WHERE id = $1`,
            [existing.id],
          );
        }
        return existing;
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

    async findSessionByToken(token: string): Promise<{ id: string; email: string; alert_consent: boolean } | null> {
      const res = await client.query<{ id: string; email: string; alert_consent: boolean }>(
        `SELECT id, email, alert_consent FROM tracker_sessions WHERE token = $1`,
        [token],
      );
      return res.rows[0] ?? null;
    },

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
  };
}
