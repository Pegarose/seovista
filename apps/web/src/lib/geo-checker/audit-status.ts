/**
 * Authoritative statuses persisted by the worker/PostgreSQL seam. The web
 * boundary deliberately keeps this vocabulary separate from compatibility
 * aliases so the client cannot accidentally invent a new persisted state.
 */
export const AUDIT_AUTHORITATIVE_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "permanent",
  "timeout",
] as const;
export type AuditAuthoritativeStatus = (typeof AUDIT_AUTHORITATIVE_STATUSES)[number];

/**
 * Read-only legacy aliases accepted from older/replayed records. They are
 * rendered distinctly as required by the public result contract, but no GEO
 * producer or single-flight query writes or treats them as authoritative.
 */
export const AUDIT_COMPATIBILITY_ALIASES = ["pending", "permanent_failure"] as const;
export type AuditCompatibilityAlias = (typeof AUDIT_COMPATIBILITY_ALIASES)[number];

export const AUDIT_IN_FLIGHT_STATUSES = ["queued", "running", "pending"] as const;
export type AuditInFlightStatus = (typeof AUDIT_IN_FLIGHT_STATUSES)[number];

export const AUDIT_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "timeout",
  "permanent",
  "permanent_failure",
] as const;
export type AuditTerminalStatus = (typeof AUDIT_TERMINAL_STATUSES)[number];

export type AuditLifecycleStatus = AuditInFlightStatus | AuditTerminalStatus;
export type AuditStatus = AuditLifecycleStatus | "unknown";

const AUDIT_PERSISTED_TO_PUBLIC_MAP: Readonly<Record<string, AuditLifecycleStatus>> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  permanent: "permanent",
  timeout: "timeout",
  // Legacy/replayed rows are rendered as their explicit compatibility state.
  // These aliases are never written by the worker or used by single-flight.
  pending: "pending",
  permanent_failure: "permanent_failure",
};

const AUDIT_PUBLIC_TO_AUTHORITATIVE_MAP: Readonly<Record<string, AuditAuthoritativeStatus>> = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
  permanent: "permanent",
  timeout: "timeout",
  pending: "queued",
  permanent_failure: "permanent",
};

/** Maps a persisted/public value to the explicit client lifecycle vocabulary. */
export function toPublicAuditStatus(value: unknown): AuditStatus {
  if (typeof value !== "string") return "unknown";
  return AUDIT_PERSISTED_TO_PUBLIC_MAP[value] ?? "unknown";
}

/**
 * Maps a public lifecycle value to the only statuses the worker/PostgreSQL
 * boundary may persist. Unknown values fail closed instead of being coerced.
 */
export function toAuthoritativeAuditStatus(
  value: unknown,
): AuditAuthoritativeStatus | null {
  if (typeof value !== "string") return null;
  return AUDIT_PUBLIC_TO_AUTHORITATIVE_MAP[value] ?? null;
}

export function isAuditAuthoritativeStatus(
  value: unknown,
): value is AuditAuthoritativeStatus {
  return toAuthoritativeAuditStatus(value) === value;
}

export interface AuditStatusRecord {
  /** Safe client-facing lifecycle value, or explicit unknown. */
  status: AuditStatus;
  /** The raw value read from the authoritative persistence boundary. */
  persistedStatus: unknown;
  [key: string]: unknown;
}

export function normalizeAuditStatus(value: unknown): AuditStatus {
  return toPublicAuditStatus(value);
}

export function normalizeAuditStatusRecord<T extends Record<string, any>>(
  record: T,
): Omit<T, "status" | "persistedStatus"> & {
  status: AuditStatus;
  persistedStatus: T["status"];
} {
  const persistedStatus = record.status;
  const result: any = { ...record };
  delete result.status;
  delete result.persistedStatus;

  return {
    ...result,
    status: normalizeAuditStatus(persistedStatus),
    persistedStatus,
  };
}

export type AuditStatusActionResult =
  | { success: true; data: AuditStatusRecord }
  | { success: false; error: string };

const IN_FLIGHT_STATUS_SET: ReadonlySet<string> = new Set(AUDIT_IN_FLIGHT_STATUSES);
const TERMINAL_STATUS_SET: ReadonlySet<string> = new Set(AUDIT_TERMINAL_STATUSES);

export function isAuditInFlightStatus(value: unknown): value is AuditInFlightStatus {
  return typeof value === "string" && IN_FLIGHT_STATUS_SET.has(value);
}

export function isAuditTerminalStatus(value: unknown): value is AuditTerminalStatus {
  return typeof value === "string" && TERMINAL_STATUS_SET.has(value);
}

export function isAuditLifecycleStatus(value: unknown): value is AuditLifecycleStatus {
  return isAuditInFlightStatus(value) || isAuditTerminalStatus(value);
}
