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
      logger(
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
