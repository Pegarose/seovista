import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import type { DbClient } from "../db/client.js";
import type { SerpProvider, SerpEntry } from "../utils/serp-provider.js";

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
  queries: Array<{ sql: string; params?: unknown[] }>;
  insertObservationCalls: Array<{ targetId: string; position: number }>;
  updateLastCheckedCalls: string[];
} {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
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
});
