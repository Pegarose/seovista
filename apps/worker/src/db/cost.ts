import type { DbClient } from "./client.js";

export interface CostRecord {
  id: string;
  provider: string;
  operation: string;
  request_identity: string;
  correlation_id: string;
  currency: string;
  amount: string;
  recorded_at: Date;
}

export interface CreateCostRecord {
  provider: string;
  operation: string;
  requestIdentity: string;
  correlationId: string;
  currency: string;
  amount: string;
}

export function createCostRepository(client: DbClient) {
  return {
    async create(input: CreateCostRecord): Promise<CostRecord> {
      const result = await client.query<CostRecord>(
        `
          INSERT INTO api_cost_ledger (provider, operation, request_identity, correlation_id, currency, amount)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [input.provider, input.operation, input.requestIdentity, input.correlationId, input.currency, input.amount]
      );
      return result.rows[0]!;
    },

    async findByRequestIdentity(requestIdentity: string): Promise<CostRecord | null> {
      const result = await client.query<CostRecord>(
        "SELECT * FROM api_cost_ledger WHERE request_identity = $1",
        [requestIdentity]
      );
      return result.rows[0] ?? null;
    },

    async findByCorrelation(correlationId: string): Promise<CostRecord[]> {
      const result = await client.query<CostRecord>(
        "SELECT * FROM api_cost_ledger WHERE correlation_id = $1 ORDER BY recorded_at",
        [correlationId]
      );
      return result.rows;
    },

    async totalForDay(
      provider: string,
      operation: string,
      date: Date
    ): Promise<{ amount: string; count: number } | null> {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${day}`;

      const result = await client.query<{ amount: string; count: number }>(
        `
          SELECT COALESCE(SUM(amount), 0)::text AS amount, COUNT(*)::int AS count
          FROM api_cost_ledger
          WHERE provider = $1 AND operation = $2
            AND DATE(recorded_at AT TIME ZONE 'UTC') = $3::date
        `,
        [provider, operation, dateString]
      );
      return result.rows[0] ?? null;
    },
  };
}
