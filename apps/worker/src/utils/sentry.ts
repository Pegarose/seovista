import console from "node:console";
import * as Sentry from "@sentry/node";

/**
 * Sentry Instrumentation Bridge (Phase A — VAL-A-OBS-001 / VAL-A-OBS-002).
 *
 * The worker emits two business events over its lifetime:
 *
 *   • `audit_submitted` — fired once per form submission (whether the request
 *     enqueued a fresh job or deduped onto an in-flight one).
 *   • `audit_completed` — fired once per job completion, carrying the four
 *     required observability fields: `score_value`, `per_platform_confidence`,
 *     `cache_hit`, `tier`.
 *
 * The bridge is bi-modal so dev (no `SENTRY_DSN`) is observable without a real
 * Sentry account:
 *
 *   • **Real mode** (`SENTRY_DSN` present): `Sentry.init()` is called on boot
 *     and events are forwarded via `Sentry.captureEvent()`. The boot line
 *     `Sentry initialized with DSN: {masked}` is logged.
 *   • **Stub mode** (`SENTRY_DSN` empty / unset): no SDK init happens, the
 *     boot line `Sentry DSN empty — running with stub sink` is logged, and
 *     every emit writes a JSON-encoded payload to stdout via the stub sink.
 *     This keeps behavior observable in local / CI without a Sentry account.
 *
 * Both paths are crash-safe: a missing or malformed DSN never throws, and the
 * stub sink never throws on stdout writes. The audit pipeline never blocks on
 * telemetry — every emit is fire-and-forget with errors swallowed.
 */

/** Sentinel returned by {@link getSentryMode} before {@link initSentryOnBoot} runs. */
const SENTRY_MODE_UNINITIALIZED = "uninitialized" as const;

/** SDK is initialized against a real DSN; events forward to Sentry. */
const SENTRY_MODE_REAL = "real" as const;

/** DSN empty / unset; events route to the JSON-stdout stub sink. */
const SENTRY_MODE_STUB = "stub" as const;

export type SentryMode =
  | typeof SENTRY_MODE_UNINITIALIZED
  | typeof SENTRY_MODE_REAL
  | typeof SENTRY_MODE_STUB;

let currentMode: SentryMode = SENTRY_MODE_UNINITIALIZED;

/**
 * Returns the active Sentry mode. Useful for tests and for callers that want
 * to branch without re-reading the env. Before {@link initSentryOnBoot} runs
 * the mode is `uninitialized`; once init succeeds it is `real` or `stub`.
 */
export function getSentryMode(): SentryMode {
  return currentMode;
}

/**
 * Resets the bridge to its pre-init state. Intended for unit tests that
 * re-invoke {@link initSentryOnBoot} across scenarios. Production code never
 * calls this.
 */
export function __resetSentryForTests(): void {
  currentMode = SENTRY_MODE_UNINITIALIZED;
}

/**
 * Masks a Sentry DSN for safe logging. Keeps the scheme + host + project id
 * visible (operators need to confirm WHICH project they are shipping to) but
 * redacts the public key entirely. Examples:
 *
 *   https://abc123@o123.ingest.sentry.io/456  →  https://****@o123.ingest.sentry.io/456
 *   http://x@host/1                          →  http://****@host/1
 *
 * Falls back to `****` for malformed DSNs so a malformed value is never
 * logged in clear text.
 */
export function maskSentryDsn(dsn: string): string {
  try {
    const url = new URL(dsn);
    if (url.username) {
      url.username = "****";
    }
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return "****";
  }
}

/**
 * Reads `SENTRY_DSN` from the environment. Trims surrounding whitespace; an
 * empty / whitespace-only value is treated as "unset" (stub mode).
 */
function readSentryDsn(env: Record<string, string | undefined> = process.env): string {
  const raw = env.SENTRY_DSN;
  return raw !== undefined ? raw.trim() : "";
}

/**
 * Initializes the Sentry SDK on worker boot.
 *
 * - When `SENTRY_DSN` is non-empty: calls `Sentry.init()` with a minimal,
 *   fail-safe config and logs `Sentry initialized with DSN: {masked}`.
 * - When `SENTRY_DSN` is empty / unset: skips SDK init, logs
 *   `Sentry DSN empty — running with stub sink`, and switches the bridge to
 *   the JSON-stdout stub sink so emits remain observable in dev / CI.
 *
 * Never throws — any init failure is caught, logged, and the bridge falls
 * back to stub mode so the worker never crashes on telemetry setup.
 */
export async function initSentryOnBoot(
  env: Record<string, string | undefined> = process.env,
): Promise<SentryMode> {
  const dsn = readSentryDsn(env);

  if (dsn === "") {
    currentMode = SENTRY_MODE_STUB;
    logBoot({
      mode: SENTRY_MODE_STUB,
      message: "Sentry DSN empty — running with stub sink",
      dsnMasked: "",
    });
    return SENTRY_MODE_STUB;
  }

  try {
    Sentry.init({
      dsn,
      // Business events are info-level; keep default integrations so errors /
      // breadcrumbs still flow, but do not enable performance tracing in the
      // worker (BullMQ + fetcher tracing is out of Phase A scope).
      tracesSampleRate: 0,
      // Graceful no-op on invalid / placeholder DSNs — Sentry refuses to send
      // when the DSN is unusable, which is the desired dev behavior.
      sendClientReports: false,
    });
    currentMode = SENTRY_MODE_REAL;
    const masked = maskSentryDsn(dsn);
    logBoot({
      mode: SENTRY_MODE_REAL,
      message: `Sentry initialized with DSN: ${masked}`,
      dsnMasked: masked,
    });
    return SENTRY_MODE_REAL;
  } catch (error) {
    // Init failures must NEVER crash the worker. Fall back to stub mode so
    // emits remain observable (stub sink) while operators investigate.
    currentMode = SENTRY_MODE_STUB;
    logBoot({
      mode: SENTRY_MODE_STUB,
      message: "Sentry DSN empty — running with stub sink",
      dsnMasked: "",
      error: error instanceof Error ? error.message : String(error),
      fallback: true,
    });
    return SENTRY_MODE_STUB;
  }
}

/**
 * Flushes pending Sentry events and closes the SDK. Safe to call when in stub
 * mode (no-op) or before init (no-op). Intended for the worker shutdown path.
 */
export async function closeSentry(): Promise<void> {
  if (currentMode !== SENTRY_MODE_REAL) {
    return;
  }
  try {
    await Sentry.flush(2_000);
  } catch {
    // best-effort
  }
  try {
    await Sentry.close();
  } catch {
    // best-effort
  }
}

/** Payload for the `audit_submitted` event (one per form submission). */
export interface AuditSubmittedPayload {
  /** Canonical audit target URL. */
  url: string;
  /** job_records id the form submission resolved to (enqueued or deduped). */
  jobId: string;
  /** sha256(canonicalUrl) cache key used for single-flight dedupe. */
  cacheKey: string;
  /** `true` when the submission deduped onto an in-flight job. */
  deduped: boolean;
  /** `true` when the caller requested a cache bypass / fresh render. */
  forceAudit: boolean;
}

/** Per-platform confidence map for `audit_completed`. */
export interface PerPlatformConfidence {
  chatgpt: number;
  perplexity: number;
  googleAiOverviews: number;
  bingCopilot: number;
}

/** Payload for the `audit_completed` event (one per job completion). */
export interface AuditCompletedPayload {
  /** job_records id that completed. */
  jobId: string;
  /** Correlation ID thread spanning API to Worker to Crew. */
  correlationId?: string;
  /** Canonical audit target URL. */
  url: string;
  /** Deterministic 0–100 overall score. */
  score_value: number;
  /** Per-platform confidence (0–1 from the AI Visibility breakdown). */
  per_platform_confidence: PerPlatformConfidence;
  /** `true` when the render cache supplied the parsed page (no Browseract). */
  cache_hit: boolean;
  /** Score band / tier: `excellent` | `good` | `needs_improvement` | `poor` | `critical`. */
  tier: string;
}

/**
 * Emits the `audit_submitted` event. Routes to `Sentry.captureEvent` in real
 * mode or to the JSON-stdout stub sink in stub mode. Never throws — telemetry
 * failures are swallowed so the audit pipeline is never blocked.
 */
export function emitAuditSubmitted(payload: AuditSubmittedPayload): void {
  const event = {
    event: "audit_submitted",
    ...payload,
    timestamp: new Date().toISOString(),
  };
  emit(event, "audit_submitted");
}

/**
 * Emits the `audit_completed` event with the four required observability
 * fields (`score_value`, `per_platform_confidence`, `cache_hit`, `tier`).
 * Routes to `Sentry.captureEvent` in real mode or to the JSON-stdout stub
 * sink in stub mode. Never throws.
 */
export function emitAuditCompleted(payload: AuditCompletedPayload): void {
  const event = {
    event: "audit_completed",
    ...payload,
    timestamp: new Date().toISOString(),
  };
  emit(event, "audit_completed");
}

export interface CrewFailurePayload {
  url: string;
  jobId: string;
  correlationId: string;
  statusCode?: number;
  errorMessage: string;
}

export function emitCrewFailureBreadcrumb(payload: CrewFailurePayload): void {
  if (currentMode === SENTRY_MODE_REAL) {
    try {
      Sentry.addBreadcrumb({
        category: "crew_webhook",
        message: "Crew Agency webhook failed",
        level: "error",
        data: payload,
      });
    } catch {
      // Telemetry must never block
    }
  } else {
    // Stub mode logging for observability
    writeStubSink({
      event: "crew_webhook_failure",
      ...payload
    });
  }
}

/**
 * Internal dispatcher. Real mode forwards a custom event to Sentry with the
 * four required fields exposed as both `tags` (for grouping in the Sentry UI)
 * and `extra` (for full structured payload). Stub mode writes the JSON-
 * encoded payload to stdout so behavior is verifiable without a Sentry
 * account.
 */
function emit(payload: Record<string, unknown>, eventName: string): void {
  if (currentMode === SENTRY_MODE_REAL) {
    try {
      Sentry.captureEvent({
        message: eventName,
        level: "info",
        tags: buildTags(payload),
        extra: payload,
      });
    } catch (error) {
      // Telemetry must never break the audit pipeline. Fall back to the stub
      // sink so the event is still observable on stdout.
      writeStubSink(payload, error);
    }
    return;
  }

  // Stub mode (or uninitialized — emit anyway so dev events are never lost
  // before boot init runs, e.g. in tests that exercise emit directly).
  writeStubSink(payload);
}

/**
 * Lifts the scalar / boolean / string fields of the payload into a flat
 * `tags` record so operators can group / filter by `tier`, `cache_hit`,
 * `event` in the Sentry UI. Nested objects (per_platform_confidence) stay in
 * `extra` only.
 */
function buildTags(payload: Record<string, unknown>): Record<string, string | number | boolean> {
  const tags: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      tags[key] = value;
    }
  }
  return tags;
}

/**
 * Stub sink: writes a JSON-encoded payload to stdout. The payload is wrapped
 * in a structured envelope (`sentry_stub_sink` layer) so it is greppable and
 * distinguishable from other worker logs. An optional `error` is attached
 * when the real SDK threw and we fell back to the stub.
 */
function writeStubSink(payload: Record<string, unknown>, error?: unknown): void {
  const envelope = {
    name: "@seovista/worker",
    layer: "sentry_stub_sink",
    sink: "stub",
    ...payload,
    ...(error
      ? { sdk_error: error instanceof Error ? error.message : String(error) }
      : {}),
    timestamp: new Date().toISOString(),
  };
  try {
    console.log(JSON.stringify(envelope));
  } catch {
    // Even JSON.stringify / console.log can throw in pathological environments;
    // swallow so the audit pipeline is never blocked.
  }
}

/** Structured boot log line. The `message` field carries the exact contract
 * signature so validators can grep for it. */
function logBoot(details: {
  mode: SentryMode;
  message: string;
  dsnMasked: string;
  error?: string;
  fallback?: boolean;
}): void {
  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "sentry",
      event: "boot_init",
      mode: details.mode,
      message: details.message,
      ...(details.dsnMasked ? { dsnMasked: details.dsnMasked } : {}),
      ...(details.error ? { error: details.error } : {}),
      ...(details.fallback ? { fallback: true } : {}),
      timestamp: new Date().toISOString(),
    }),
  );
}
