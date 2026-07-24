import console from "node:console";
import { getDailyCreditLimit, getDailyCreditConsumed } from "./render-cache.js";

/**
 * Daily Browseract Credit Guard (Phase A — VAL-A-MIT-003 / VAL-A-MIT-004).
 *
 * Before the fetcher invokes Browseract — and after the render-cache miss
 * check — the guard compares the current daily credit counter
 * (`browseract:credits:consumed:{YYYY-MM-DD}` in Redis DB 1) against the
 * `BROWSERACT_DAILY_CREDIT_LIMIT` env var (default 4000). When the counter
 * has reached or exceeded the limit, the fetcher skips the Browseract call,
 * proceeds with the Cheerio-only path, and emits a warning log carrying the
 * remaining-counter value. On worker boot, {@link logDailyCreditBudgetOnBoot}
 * emits `Browseract credits remaining today: {N}` so operators can see the
 * remaining daily budget at startup.
 *
 * All reads are fail-safe: when Redis is unreachable the consumed value is
 * reported as `0`, so the guard degrades to "under limit" and the audit
 * pipeline never blocks on credit accounting.
 */

/** Snapshot of the daily Browseract credit budget at a point in time. */
export interface DailyCreditStatus {
  /** Configured daily cap (`BROWSERACT_DAILY_CREDIT_LIMIT`, default 4000). */
  limit: number;
  /** Counter value read from Redis DB 1 (`browseract:credits:consumed:{date}`). */
  consumed: number;
  /** `max(0, limit - consumed)`. */
  remaining: number;
  /** `true` when `consumed >= limit` (Browseract must be skipped). */
  exhausted: boolean;
}

/**
 * Reads the current daily credit status from Redis DB 1 + env. Never throws —
 * Redis failures collapse to `consumed = 0` (under limit).
 */
export async function getDailyCreditStatus(): Promise<DailyCreditStatus> {
  const limit = getDailyCreditLimit();
  const consumed = await getDailyCreditConsumed();
  const remaining = Math.max(0, limit - consumed);
  return {
    limit,
    consumed,
    remaining,
    exhausted: consumed >= limit,
  };
}

/**
 * Returns `true` when the daily Browseract credit budget is exhausted
 * (`consumed >= limit`). The fetcher uses this to decide whether to skip the
 * Browseract call and fall back to Cheerio (VAL-A-MIT-003).
 */
export async function isDailyCreditExhausted(): Promise<boolean> {
  const status = await getDailyCreditStatus();
  return status.exhausted;
}

/**
 * Emits the boot-time remaining-budget log line
 *   `Browseract credits remaining today: {N}`
 * where `N = limit - counter` (clamped at 0). Returns the snapshot so callers
 * (e.g. the worker startup sequence) can include it in further structured
 * logs (VAL-A-MIT-004).
 */
export async function logDailyCreditBudgetOnBoot(): Promise<DailyCreditStatus> {
  const status = await getDailyCreditStatus();
  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "credit-guard",
      event: "boot_budget",
      message: `Browseract credits remaining today: ${status.remaining}`,
      limit: status.limit,
      consumed: status.consumed,
      remaining: status.remaining,
      exhausted: status.exhausted,
      timestamp: new Date().toISOString(),
    }),
  );
  return status;
}
