## Task 3: Tracker Scan Processor

**Files:**
- Create: `apps/worker/src/processors/tracker-scan.ts`
- Test: `apps/worker/src/__tests__/tracker-scan-processor.test.ts`

**Interfaces:**
- Consumes: `SerpProvider` from `../utils/serp-provider.js`, `extractKeywordRank` + `parseSerpEntries` from `@seovista/seo-core`, `createTrackerRepository` from `../db/tracker-repository.js`
- Produces: `processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult>` where:
  - `TrackerScanInput = { db: DbClient; provider: SerpProvider; delayMs?: number }`
  - `TrackerScanResult = { scanned: number; successes: number; failures: number; durationMs: number }`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/__tests__/tracker-scan-processor.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-processor.test.ts`
Expected: FAIL — `Cannot find module '../processors/tracker-scan.js'`

- [ ] **Step 3: Implement the processor**

Create `apps/worker/src/processors/tracker-scan.ts`:

```typescript
import console from "node:console";
import {
  extractKeywordRank,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";
import type { DbClient } from "../db/client.js";
import { createTrackerRepository, type ActiveTarget } from "../db/tracker-repository.js";
import type { SerpProvider } from "../utils/serp-provider.js";

export interface TrackerScanInput {
  db: DbClient;
  provider: SerpProvider;
  /** Delay between SearXNG queries in ms (rate-limit courtesy). Default 2000. */
  delayMs?: number;
}

export interface TrackerScanResult {
  scanned: number;
  successes: number;
  failures: number;
  durationMs: number;
}

const DEFAULT_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a batch tracker scan: iterates all active keyword targets, queries
 * SearXNG for each via the injected SERP provider, extracts the target's
 * position, records a `rank_observations` row, and updates `last_checked_at`.
 *
 * Single-target failures are logged and do not abort the batch. The function
 * returns aggregate counts for operator visibility.
 */
export async function processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult> {
  const { db, provider, delayMs = DEFAULT_DELAY_MS } = input;
  const repo = createTrackerRepository(db);
  const startTime = Date.now();

  const targets: ActiveTarget[] = await repo.listActiveTargets();
  let successes = 0;
  let failures = 0;

  for (const target of targets) {
    try {
      const entries: SerpEntry[] = await provider.search(
        target.keyword,
        target.locale as SerpLocale,
        target.domain,
      );

      const { position, top10 } = extractKeywordRank({
        domain: target.domain,
        entries,
      });

      const topCompetitors = top10.map((entry) => ({
        rank: entry.position,
        domain: extractDomainFromUrl(entry.url),
      }));

      await repo.insertObservation({
        targetId: target.id,
        position: position ?? 0,
        topCompetitors,
      });

      await repo.updateLastCheckedAt(target.id);
      successes++;
    } catch (error) {
      failures++;
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "target_scan_failed",
          targetId: target.id,
          keyword: target.keyword,
          domain: target.domain,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    // Rate-limit courtesy delay between queries (skip after the last target).
    if (delayMs > 0) await sleep(delayMs);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "tracker-scan",
      event: "batch_complete",
      scanned: targets.length,
      successes,
      failures,
      durationMs,
      timestamp: new Date().toISOString(),
    }),
  );

  return { scanned: targets.length, successes, failures, durationMs };
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @seovista/worker exec vitest run src/__tests__/tracker-scan-processor.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/processors/tracker-scan.ts apps/worker/src/__tests__/tracker-scan-processor.test.ts
git commit -m "feat(worker): tracker scan processor — batch SERP scan with per-target error isolation

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---


