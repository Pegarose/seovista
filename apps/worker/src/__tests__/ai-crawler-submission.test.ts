import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DbClient } from "../db/client.js";

const bullmqState = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string, _options: unknown) {
      this.name = name;
    }
    add(...args: unknown[]) {
      return bullmqState.add(...args);
    }
    async close(): Promise<void> {
      // no-op: the mocked producer holds no Redis connection
    }
  },
}));

import {
  submitAiCrawlerAudit,
  __resetAiCrawlerSubmissionQueueForTests,
} from "../queue/ai-crawler-submission.js";

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

describe("submitAiCrawlerAudit", () => {
  beforeEach(() => {
    bullmqState.add.mockReset();
    __resetAiCrawlerSubmissionQueueForTests();
  });

  afterEach(() => {
    __resetAiCrawlerSubmissionQueueForTests();
  });

  it("inserts the job record and returns its id when the enqueue succeeds", async () => {
    bullmqState.add.mockResolvedValue({});
    const { db, calls } = createFakeDb();

    const result = await submitAiCrawlerAudit({
      db,
      redisUrl: REDIS_URL,
      url: TARGET_URL,
    });

    const insert = calls.find((c) => /INSERT INTO job_records/.test(c.sql));
    expect(insert).toBeDefined();
    expect(result.jobId).toBe(insert!.params![0]);
    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(false);
  });

  it("deletes the orphaned job record and surfaces the error when the enqueue fails", async () => {
    const enqueueError = new Error("redis unavailable");
    bullmqState.add.mockRejectedValueOnce(enqueueError);
    const { db, calls } = createFakeDb();

    await expect(
      submitAiCrawlerAudit({ db, redisUrl: REDIS_URL, url: TARGET_URL }),
    ).rejects.toBe(enqueueError);

    const insert = calls.find((c) => /INSERT INTO job_records/.test(c.sql));
    expect(insert).toBeDefined();
    const orphanDelete = calls.find((c) => /DELETE FROM job_records/.test(c.sql));
    expect(orphanDelete).toBeDefined();
    // The compensation removes exactly the row this submission inserted.
    expect(orphanDelete!.params).toEqual([insert!.params![0]]);
  });

  it("still surfaces the original enqueue error when the compensation delete fails", async () => {
    const enqueueError = new Error("redis unavailable");
    bullmqState.add.mockRejectedValueOnce(enqueueError);
    const { db, calls } = createFakeDb({ failOnDelete: true });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        submitAiCrawlerAudit({ db, redisUrl: REDIS_URL, url: TARGET_URL }),
      ).rejects.toBe(enqueueError);
    } finally {
      consoleError.mockRestore();
    }

    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(true);
  });
});
