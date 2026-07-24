import type { DbClient } from "./client.js";

export interface GeoAuditLeadRow {
  id: string;
  domain: string;
  brand_name: string;
  primary_market: string;
  work_email: string | null;
  marketing_consent: boolean;
  created_at: Date;
}

export interface AdminLeadListRow {
  id: string;
  domain: string;
  brandName: string;
  primaryMarket: string;
  workEmail: string | null;
  marketingConsent: boolean;
  createdAt: Date;
  jobStatus: string | null;
}

export function createGeoAuditRepository(client: DbClient) {
  return {
    async createLead(data: { domain: string; brandName: string; primaryMarket: string }) {
      const res = await client.query<GeoAuditLeadRow>(
        `INSERT INTO geo_audit_leads (domain, brand_name, primary_market)
         VALUES ($1, $2, $3) RETURNING *`,
        [data.domain, data.brandName, data.primaryMarket]
      );
      return res.rows[0]!;
    },
    async updateLeadEmail(leadId: string, email: string, consent: boolean) {
      const res = await client.query<GeoAuditLeadRow>(
        `UPDATE geo_audit_leads SET work_email = $1, marketing_consent = $2 
         WHERE id = $3 RETURNING *`,
        [email, consent, leadId]
      );
      if (res.rowCount === 0) throw new Error("Lead not found");
      return res.rows[0]!;
    },
    async createJobRecord(data: {
      target: string;
      service: string;
      status: string;
      leadId: string;
      /**
       * Optional explicit primary key for the job_records row. The single-flight
       * dedupe path pre-generates a UUID so it can write it into the Redis lock
       * value BEFORE inserting the row — that way a concurrent deduped
       * submission can recover the in-flight job id directly from the lock.
       * When omitted, Postgres `gen_random_uuid()` assigns the id.
       */
      id?: string;
      /**
       * Phase A single-flight dedupe handle: `sha256(canonicalUrl)`. Stored so
       * a deduped submission can locate the in-flight job_records row by URL
       * even if the Redis lock value race-window has not yet published the id.
       */
      cacheKey?: string;
    }): Promise<string> {
      // NOTE: We need job_identity, queue_name. For service we might map to queue_name.
      // The task specifically says: "(target, service, status, lead_id)".
      // Target goes to target, service -> queue_name, status -> status, lead_id -> lead_id.
      // Wait, does job_records have job_identity, correlation_id? Let's check job.ts and migration.
      // We will generate a uuid for identity/correlation.

      const jobIdentity = crypto.randomUUID();
      const correlationId = crypto.randomUUID();

      // Build the INSERT dynamically so the optional `id` and `cache_key`
      // columns are only included when supplied (keeps legacy callers that do
      // not know about single-flight working unchanged).
      const columns = [
        "job_identity",
        "queue_name",
        "correlation_id",
        "target",
        "status",
        "lead_id",
      ];
      const values: unknown[] = [
        jobIdentity,
        data.service,
        correlationId,
        data.target,
        data.status,
        data.leadId,
      ];

      if (data.id) {
        columns.push("id");
        values.push(data.id);
      }
      if (data.cacheKey) {
        columns.push("cache_key");
        values.push(data.cacheKey);
      }

      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
      const res = await client.query<{ id: string }>(
        `INSERT INTO job_records (${columns.join(", ")})
         VALUES (${placeholders}) RETURNING id`,
        values,
      );
      return res.rows[0]!.id;
    },
    /**
     * Returns the id of the most recent non-terminal (queued/running)
     * `job_records` row for a given canonical cache key, or `null` when no
     * in-flight job exists.
     *
     * Used by the single-flight dedupe path: when the Redis lock is already
     * held, a deduped submission looks up the in-flight job by `cache_key` so
     * its client can poll `job_records.status` instead of enqueuing a
     * duplicate. Terminal rows (completed/failed/permanent/timeout) are
     * intentionally excluded so a re-audit after completion is not mistaken
     * for an in-flight duplicate.
     */
    async findInFlightJobByCacheKey(cacheKey: string): Promise<string | null> {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM job_records
         WHERE cache_key = $1 AND status IN ('queued', 'running')
         ORDER BY created_at DESC
         LIMIT 1`,
        [cacheKey],
      );
      return res.rows[0]?.id ?? null;
    },
    async getJobRecord(id: string) {
      const res = await client.query<{ status: string; lead_id: string; work_email: string | null }>(
        `SELECT j.status, j.lead_id, l.work_email 
         FROM job_records j
         LEFT JOIN geo_audit_leads l ON j.lead_id = l.id
         WHERE j.id = $1`,
        [id]
      );
      return res.rows[0];
    },
    /**
     * Fetch the most recent `job_results.payload` for a `job_records.id`.
     *
     * The payload is JSONB; `pg` parses JSONB columns into a JS object
     * automatically, so the returned value is the parsed result payload
     * (object) or `null` when no result row exists yet. The result-page RSC
     * uses this to render the per-module score breakdown
     * (`ScoreBreakdown`) without recomputing any score.
     */
    async getJobResultPayload(id: string): Promise<Record<string, unknown> | null> {
      const res = await client.query<{ payload: unknown }>(
        `SELECT r.payload
         FROM job_records j
         JOIN job_results r ON r.correlation_id = j.correlation_id
         WHERE j.id = $1
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [id]
      );
      const row = res.rows[0];
      if (!row) return null;
      const payload = row.payload;
      if (typeof payload === "string") {
        try {
          return JSON.parse(payload) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
      return (payload ?? null) as Record<string, unknown> | null;
    },
    async getAllLeadsForAdmin(): Promise<AdminLeadListRow[]> {
      const res = await client.query<any>(
        `SELECT l.id, l.domain, l.brand_name as "brandName", l.primary_market as "primaryMarket", l.work_email as "workEmail", l.marketing_consent as "marketingConsent", l.created_at as "createdAt", j.status AS "jobStatus" FROM geo_audit_leads l LEFT JOIN job_records j ON l.id = j.lead_id ORDER BY l.created_at DESC`
      );
      return res.rows;
    }
  };
}
