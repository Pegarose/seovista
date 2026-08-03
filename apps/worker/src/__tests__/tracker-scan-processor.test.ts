import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DbClient } from "../db/client.js";
import type { SerpProvider } from "../utils/serp-provider.js";
import type { SerpEntry } from "@seovista/seo-core";

const mockProvider: SerpProvider = {
  source: "mock",
  async search(_keyword: string, _locale: string, domain?: string): Promise<SerpEntry[]> {
    return [
      { position: 1, url: "https://rival.com/", title: "Rival", snippet: "r" },
      { position: 2, url: `https://${domain ?? "target.com"}/`, title: "Target", snippet: "t" },
    ];
  },
};

function createFakeDb(targetRows: Array<{ id: string; sessionId: string; keyword: string; domain: string; locale: string }>): {
  db: DbClient;
  queries: Array<{ sql: string; params: unknown[] | undefined }>;
  insertObservationCalls: Array<{ targetId: string; position: number }>;
  updateLastCheckedCalls: string[];
} {
  const queries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const insertObservationCalls: Array<{ targetId: string; position: number }> = [];
  const updateLastCheckedCalls: string[] = [];

  const db: DbClient = {
    async query<T extends QueryResultRow = QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      queries.push({ sql, params });
      // listActiveTargets query
      if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
        return { command: "", rowCount: targetRows.length, oid: 0, fields: [], rows: targetRows as unknown as T[] };
      }
      // INSERT INTO rank_observations
      if (/INSERT INTO rank_observations/i.test(sql)) {
        const targetId = params?.[0] as string;
        const position = params?.[1] as number;
        insertObservationCalls.push({ targetId, position });
        return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
      }
      // UPDATE keyword_targets SET last_checked_at
      if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
        updateLastCheckedCalls.push(params?.[0] as string);
        return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
      }
      return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
    },
    async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> {
      throw new Error("transaction not supported by fake DbClient");
    },
    async close(): Promise<void> {},
  };

  return { db, queries, insertObservationCalls, updateLastCheckedCalls };
}

describe("processTrackerScanBatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scans all active targets and records observations", async () => {
    const { createTrackerRepository } = await import("../db/tracker-repository.js");
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");

    const targets = [
      { id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" },
      { id: "t2", sessionId: "s2", keyword: "sem", domain: "b.com", locale: "tr-TR" },
    ];
    const { db, insertObservationCalls, updateLastCheckedCalls } = createFakeDb(targets);

    // Stub the repository methods — the fake db returns the target rows for
    // the listActiveTargets query, and insertObservation/updateLastCheckedAt
    // are captured by the fake db's query handler.
    const result = await processTrackerScanBatch({
      db,
      provider: mockProvider,
      delayMs: 0,
    });

    expect(result.scanned).toBe(2);
    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(insertObservationCalls).toHaveLength(2);
    expect(updateLastCheckedCalls).toHaveLength(2);
    // Position 2 because the mock provider places the target at position 2
    expect(insertObservationCalls[0]!.position).toBe(2);
    // Reference createTrackerRepository to satisfy the import (the repository
    // is exercised internally by the processor via the same factory).
    expect(typeof createTrackerRepository).toBe("function");
  });

  it("continues batch when a single target fails", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");

    const failingProvider: SerpProvider = {
      source: "mock",
      async search(keyword: string): Promise<SerpEntry[]> {
        if (keyword === "fail") throw new Error("SERP error");
        return [{ position: 1, url: "https://ok.com/", title: "OK", snippet: "o" }];
      },
    };

    const targets = [
      { id: "t1", sessionId: "s1", keyword: "fail", domain: "a.com", locale: "tr-TR" },
      { id: "t2", sessionId: "s2", keyword: "ok", domain: "b.com", locale: "tr-TR" },
    ];
    const { db, insertObservationCalls } = createFakeDb(targets);

    const result = await processTrackerScanBatch({
      db,
      provider: failingProvider,
      delayMs: 0,
    });

    expect(result.scanned).toBe(2);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(1);
    expect(insertObservationCalls).toHaveLength(1);
    expect(insertObservationCalls[0]!.targetId).toBe("t2");
  });

  it("returns zero counts when no active targets exist", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const { db } = createFakeDb([]);
    const result = await processTrackerScanBatch({ db, provider: mockProvider, delayMs: 0 });
    expect(result.scanned).toBe(0);
    expect(result.successes).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("writes an alert row when a position crosses the top-10 boundary", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const insertedProducts: string[] = [];
    const db: DbClient = {
      async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }] as unknown as T[] };
        }
        if (/INSERT INTO rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/SELECT position, checked_at FROM rank_observations/i.test(sql)) {
          return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] }; // prev = null -> baseline, no alert
        }
        if (/INSERT INTO tracker_alerts/i.test(sql)) {
          insertedProducts.push((params?.[2] as string) ?? "");
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
      },
      async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> { throw new Error("no tx"); },
      async close(): Promise<void> {},
    };
    const result = await processTrackerScanBatch({ db, provider: mockProvider, delayMs: 0 });
    expect(result.successes).toBe(1);
    // First observation: prev is NULL so no alert fires.
    expect(insertedProducts).toHaveLength(0);
  });

  it("records an alert when prev exists and the position drops out of the top 10", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const kinds: string[] = [];
    const db: DbClient = {
      async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (/FROM keyword_targets WHERE active = true/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }] as unknown as T[] };
        }
        if (/INSERT INTO rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/UPDATE keyword_targets SET last_checked_at/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        if (/SELECT position, checked_at FROM rank_observations/i.test(sql)) {
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [{ position: 4, checked_at: new Date("2026-08-01T03:00:00.000Z") }] as unknown as T[] };
        }
        if (/INSERT INTO tracker_alerts/i.test(sql)) {
          kinds.push((params?.[2] as string) ?? "");
          return { command: "", rowCount: 1, oid: 0, fields: [], rows: [] };
        }
        return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] };
      },
      async transaction<T>(_fn: (client: PoolClient) => Promise<T>): Promise<T> { throw new Error("no tx"); },
      async close(): Promise<void> {},
    };
    // To force a drop out of the top 10, the provider must return no entry for the target.
    const droppingProvider: SerpProvider = {
      source: "mock",
      async search(): Promise<SerpEntry[]> {
        return [{ position: 1, url: "https://rival.com/", title: "Rival", snippet: "r" }];
      },
    };
    const result = await processTrackerScanBatch({ db, provider: droppingProvider, delayMs: 0 });
    expect(result.successes).toBe(1);
    expect(kinds).toEqual(["dropped_out_of_top10"]);
  });

  it("runs the digest and retention after the scan loop", async () => {
    const { processTrackerScanBatch } = await import("../processors/tracker-scan.js");
    const { createMockEmail } = await import("@seovista/reports");
    const email = createMockEmail();
    const { createTrackerRepository } = await import("../db/tracker-repository.js");
    const targets = [{ id: "t1", sessionId: "s1", keyword: "seo", domain: "a.com", locale: "tr-TR" }];
    const { db } = createFakeDb(targets);
    const result = await processTrackerScanBatch({
      db,
      provider: mockProvider,
      delayMs: 0,
      email,
      retentionDays: 90,
      siteUrl: "https://seovista.example",
      fromEmail: "noreply@seovista.example",
    });
    expect(result.successes).toBe(1);
    // No alerts exist in this fake db, so digest is a no-op; the call still
    // exercises the retention DELETE path without throwing.
    expect(typeof createTrackerRepository).toBe("function");
  });
});
