import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DbClient } from "../db/client.js";

const submitMock = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string, _options: unknown) {
      this.name = name;
    }
    add(...args: unknown[]) {
      return submitMock.add(...args);
    }
    async close(): Promise<void> {
      // no-op: the mocked producer holds no Redis connection
    }
  },
}));

import {
  submitSchemaTruthCheck,
  closeSchemaTruthSubmissionQueue,
  __resetSchemaTruthSubmissionQueueForTests,
} from "../queue/schema-truth-submission.js";

interface QueryCall {
  sql: string;
  params: unknown[] | undefined;
}

function createFakeDb(options?: { failOnDelete?: boolean }): {
  db: DbClient;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  const db: DbClient = {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ sql, params });
      if (options?.failOnDelete && /DELETE FROM job_records/.test(sql)) {
        throw new Error("delete failed");
      }
      return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
    },
    async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> {
      throw new Error("transaction not supported by the fake DbClient");
    },
    async close(): Promise<void> {
      // no-op
    },
  };
  return { db, calls };
}

const REDIS_URL = "redis://127.0.0.1:8637";
const TARGET_URL = "https://example.com/";

function buildInput(db: DbClient) {
  return { db, redisUrl: REDIS_URL, url: TARGET_URL };
}

describe("submitSchemaTruthCheck", () => {
  beforeEach(() => {
    submitMock.add.mockReset();
    __resetSchemaTruthSubmissionQueueForTests();
  });

  afterEach(() => {
    __resetSchemaTruthSubmissionQueueForTests();
  });

  it("inserts exactly one job_records row with the schema_truth_audit queue name and returns its id", async () => {
    submitMock.add.mockResolvedValue({});
    const { db, calls } = createFakeDb();

    const result = await submitSchemaTruthCheck(buildInput(db));

    const inserts = calls.filter((c) => /INSERT INTO job_records/.test(c.sql));
    expect(inserts).toHaveLength(1);
    const insert = inserts[0]!;
    expect(insert.params![2]).toBe("schema_truth_audit");
    expect(insert.sql).toContain("'queued'");
    expect(result.jobId).toBe(insert.params![0]);
    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(false);
  });

  it("deletes the orphaned job record and surfaces the error when the enqueue fails", async () => {
    const enqueueError = new Error("redis unavailable");
    submitMock.add.mockRejectedValueOnce(enqueueError);
    const { db, calls } = createFakeDb();

    await expect(submitSchemaTruthCheck(buildInput(db))).rejects.toBe(enqueueError);

    const insert = calls.find((c) => /INSERT INTO job_records/.test(c.sql));
    expect(insert).toBeDefined();
    const orphanDelete = calls.find((c) => /DELETE FROM job_records/.test(c.sql));
    expect(orphanDelete).toBeDefined();
    expect(orphanDelete!.sql).toBe("DELETE FROM job_records WHERE id = $1");
    expect(orphanDelete!.params).toEqual([insert!.params![0]]);
  });

  it("logs orphan_compensation_failed and still surfaces the enqueue error when the compensation delete fails", async () => {
    const enqueueError = new Error("redis unavailable");
    submitMock.add.mockRejectedValueOnce(enqueueError);
    const { db, calls } = createFakeDb({ failOnDelete: true });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(submitSchemaTruthCheck(buildInput(db))).rejects.toBe(enqueueError);
    } finally {
      consoleError.mockRestore();
    }

    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(true);
  });

  it("exposes a callable close-queue helper", async () => {
    await expect(closeSchemaTruthSubmissionQueue()).resolves.toBeUndefined();
  });
});
