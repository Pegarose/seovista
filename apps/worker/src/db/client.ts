import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export interface DbClient {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface CreateDbClientOptions {
  connectionString: string;
  schema?: string;
  max?: number;
}

export function createDbClient(options: CreateDbClientOptions): DbClient {
  const config: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
  };

  if (options.schema) {
    config.options = `-c search_path=${options.schema},public`;
  }

  const pool = new Pool(config);

  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      return pool.query<T>(sql, params);
    },

    async transaction<T>(fn: (poolClient: PoolClient) => Promise<T>): Promise<T> {
      const dbClient = await pool.connect();
      try {
        await dbClient.query("BEGIN");
        const result = await fn(dbClient);
        await dbClient.query("COMMIT");
        return result;
      } catch (error) {
        await dbClient.query("ROLLBACK").catch(() => {
          // rollback failure is swallowed; the original error is what matters
        });
        throw error;
      } finally {
        dbClient.release();
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export async function checkDbConnection(client: DbClient): Promise<boolean> {
  try {
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
