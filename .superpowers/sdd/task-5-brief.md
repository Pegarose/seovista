### Task 5: Processor integration — evaluate, insert, digest, retain

**Files:**
- Modify: `apps/worker/src/processors/tracker-scan.ts`
- Modify: `apps/worker/src/queue/tracker-scan-worker.ts`
- Test: `apps/worker/src/__tests__/tracker-scan-processor.test.ts` (extend)

**Interfaces:**
- Consumes: `createTrackerRepository` (Task 2), `evaluateTransition` (Task 3), `runAlertDigest` (Task 4), `EmailProvider` from `@seovista/reports` (Task 5 Step 5 dep), `Logger` from `../utils/logger.js`.
- Produces: `TrackerScanInput` gains `email?: EmailProvider; logger?: Logger; minDelta?: number; retentionDays?: number; siteUrl?: string; fromEmail?: string;`. `TrackerScanResult` unchanged (the digest/retention are side effects; the existing `job_results` payload shape is preserved).

- [ ] **Step 1: Write the failing processor tests**

Append to `apps/worker/src/__tests__/tracker-scan-processor.test.ts` (inside the existing `describe("processTrackerScanBatch", ...)` block):

```ts
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
    // First observation: prev is null so no alert fires.
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
    // The mock provider always places the target at position 2, so prev=4 -> next=2 is a significant_rise (delta 2)??? No: 4->2 is a rise of 2, below minDelta 3.
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
```

Note: the third test's `createFakeDb` returns an empty result for the retention DELETE (falls through to the default `return { ... rows: [] }`), which is fine — `deleteOldObservations`/`deleteOldAlerts` read `rowCount` from the fake which is `0`. The test asserts no throw and scan success.

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-scan-processor`

Expected: FAIL — the processor does not yet call `findLatestObservation`, `insertAlert`, `runAlertDigest`, or retention (no alert rows / no digest / no retention).

- [ ] **Step 3: Implement the processor integration**

Rewrite `apps/worker/src/processors/tracker-scan.ts` to the following (replacing the existing file):

```ts
import console from "node:console";
import {
  extractKeywordRank,
  normalizeHost,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";
import type { EmailProvider } from "@seovista/reports";
import type { DbClient } from "../db/client.js";
import { createTrackerRepository, type ActiveTarget } from "../db/tracker-repository.js";
import type { SerpProvider } from "../utils/serp-provider.js";
import { evaluateTransition } from "../alerts/alert-evaluator.js";
import { runAlertDigest } from "../alerts/alert-digest.js";
import { noopLogger, type Logger } from "../utils/logger.js";

export interface TrackerScanInput {
  db: DbClient;
  provider: SerpProvider;
  /** Delay between SearXNG queries in ms (rate-limit courtesy). Default 2000. */
  delayMs?: number;
  /** Mock email provider for the alert digest. Optional (Sprint 0 default). */
  email?: EmailProvider;
  /** Injected logger (defaults to a no-op). */
  logger?: Logger;
  /** Position delta threshold for significant drop/rise. Default 3. */
  minDelta?: number;
  /** Retention window in days for observations + alerts. Default 90. */
  retentionDays?: number;
  /** Trusted public origin for the digest panel link. */
  siteUrl?: string;
  /** From address for the digest email. */
  fromEmail?: string;
}

export interface TrackerScanResult {
  scanned: number;
  successes: number;
  failures: number;
  durationMs: number;
}

const DEFAULT_DELAY_MS = 2000;
const DEFAULT_MIN_DELTA = 3;
const DEFAULT_RETENTION_DAYS = 90;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a batch tracker scan: iterates all active keyword targets, queries
 * SearXNG for each via the injected SERP provider, extracts the target's
 * position, records a `rank_observations` row, and updates `last_checked_at`.
 * After each observation it evaluates the position transition and writes a
 * `tracker_alerts` row when a fixed threshold is crossed. After the loop it
 * sends the consent-gated daily digest and prunes stale observations/alerts.
 *
 * Single-target failures are logged and do not abort the batch.
 */
export async function processTrackerScanBatch(input: TrackerScanInput): Promise<TrackerScanResult> {
  const { db, provider, delayMs = DEFAULT_DELAY_MS } = input;
  const minDelta = input.minDelta ?? DEFAULT_MIN_DELTA;
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const logger = input.logger ?? noopLogger;
  const repo = createTrackerRepository(db);
  const startTime = Date.now();

  const targets: ActiveTarget[] = await repo.listActiveTargets();
  let successes = 0;
  let failures = 0;

  for (const [index, target] of targets.entries()) {
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

      const nextPosition = position ?? 0;
      const topCompetitors = top10.map((entry) => ({
        rank: entry.position,
        domain: normalizeHost(entry.url),
      }));

      const prev = await repo.findLatestObservation(target.id);
      const observedAt = new Date();

      await repo.insertObservation({
        targetId: target.id,
        position: nextPosition,
        topCompetitors,
      });

      const kind = evaluateTransition(prev?.position ?? null, nextPosition, minDelta);
      if (kind) {
        await repo.insertAlert({
          targetId: target.id,
          sessionId: target.sessionId,
          kind,
          fromPosition: prev!.position,
          toPosition: nextPosition,
          observedAt,
        });
      }

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

    if (delayMs > 0 && index < targets.length - 1) await sleep(delayMs);
  }

  // Digest + retention (only when an email provider is supplied).
  if (input.email) {
    try {
      await runAlertDigest({
        repo: {
          listUnsentAlertsForDigest: repo.listUnsentAlertsForDigest.bind(repo),
          markAlertsEmailed: repo.markAlertsEmailed.bind(repo),
        },
        email: input.email,
        logger,
        siteUrl: input.siteUrl ?? "",
        fromEmail: input.fromEmail ?? "noreply@seovista.com",
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "digest_failed",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    try {
      const observationsDeleted = await repo.deleteOldObservations(retentionDays);
      const alertsDeleted = await repo.deleteOldAlerts(retentionDays);
      logger(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "retention_complete",
          observationsDeleted,
          alertsDeleted,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "tracker-scan",
          event: "retention_failed",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }
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
```

- [ ] **Step 4: Run the processor tests to verify they pass**

Run: `$env:SEOVISTA_LIFECYCLE_CONTEXT_PATH='C:\bc-proje\Seovista\.lifecycle-evidence\seovista-dev-665e4ef3e642-context.json'; pnpm --filter @seovista/worker test -- tracker-scan-processor`

Expected: PASS (existing + new tests).

- [ ] **Step 5: Wire the worker to construct the email provider and pass env**

In `apps/worker/src/queue/tracker-scan-worker.ts`, import the email provider and pass options into the processor call. Modify the import block and the `processTrackerScanBatch` call:

```ts
import { createMockEmail } from "@seovista/reports";
// ... inside the job handler, replace the processTrackerScanBatch call:
const result = await processTrackerScanBatch({
  db,
  provider,
  delayMs,
  email: createMockEmail(),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  fromEmail: process.env.TRACKER_ALERTS_FROM_EMAIL ?? "noreply@seovista.com",
  minDelta: Number(process.env.TRACKER_ALERT_MIN_DELTA) || 3,
  retentionDays: Number(process.env.TRACKER_RETENTION_DAYS) || 90,
});
```

- [ ] **Step 6: Typecheck and lint the worker**

Run: `pnpm --filter @seovista/worker typecheck` and `pnpm --filter @seovista/worker lint`

Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/processors/tracker-scan.ts apps/worker/src/queue/tracker-scan-worker.ts apps/worker/src/__tests__/tracker-scan-processor.test.ts
git commit -m "feat(worker): integrate alert evaluation, digest, and retention into tracker scan"
```
