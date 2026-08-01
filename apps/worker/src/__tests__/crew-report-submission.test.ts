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
  submitCrewReport,
  __resetCrewReportSubmissionQueueForTests,
  CREW_REPORT_JOB_NAME,
  CREW_REPORT_JOB_RECORD_QUEUE_NAME,
} from "../queue/crew-report-submission.js";

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
const SOURCE_JOB_ID = "7d3e1f2a-0000-4000-8000-abcdefabcdef";
const TOOL = "geo-readiness" as const;

describe("submitCrewReport", () => {
  beforeEach(() => {
    bullmqState.add.mockReset();
    __resetCrewReportSubmissionQueueForTests();
  });

  afterEach(() => {
    __resetCrewReportSubmissionQueueForTests();
  });

  it("inserts the job record, enqueues the job payload, and returns the job id", async () => {
    bullmqState.add.mockResolvedValue({});
    const { db, calls } = createFakeDb();

    const result = await submitCrewReport({
      db,
      redisUrl: REDIS_URL,
      sourceJobId: SOURCE_JOB_ID,
      tool: TOOL,
    });

    const insert = calls.find((c) => /INSERT INTO job_records/.test(c.sql));
    expect(insert).toBeDefined();
    expect(result.jobId).toBe(insert!.params![0]);
    // The job_records row carries the crew_report service identifier so the
    // status action can filter on it, and the target is the source job the
    // report is generated from.
    expect(insert!.params![2]).toBe(CREW_REPORT_JOB_RECORD_QUEUE_NAME);
    expect(CREW_REPORT_JOB_RECORD_QUEUE_NAME).toBe("crew_report");
    expect(insert!.params![4]).toBe(SOURCE_JOB_ID);
    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(false);

    // The BullMQ job carries exactly the shape the crew report worker consumes.
    expect(bullmqState.add).toHaveBeenCalledTimes(1);
    const [jobName, jobData, jobOptions] = bullmqState.add.mock.calls[0]!;
    expect(jobName).toBe(CREW_REPORT_JOB_NAME);
    expect(jobData).toEqual({
      jobId: result.jobId,
      sourceJobId: SOURCE_JOB_ID,
      tool: TOOL,
    });
    expect(jobOptions).toEqual({ jobId: result.jobId });
  });

  it("deletes the orphaned job record and surfaces the error when the enqueue fails", async () => {
    const enqueueError = new Error("redis unavailable");
    bullmqState.add.mockRejectedValueOnce(enqueueError);
    const { db, calls } = createFakeDb();

    await expect(
      submitCrewReport({
        db,
        redisUrl: REDIS_URL,
        sourceJobId: SOURCE_JOB_ID,
        tool: TOOL,
      }),
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
        submitCrewReport({
          db,
          redisUrl: REDIS_URL,
          sourceJobId: SOURCE_JOB_ID,
          tool: TOOL,
        }),
      ).rejects.toBe(enqueueError);
    } finally {
      consoleError.mockRestore();
    }

    expect(calls.some((c) => /DELETE FROM job_records/.test(c.sql))).toBe(true);
  });
});
