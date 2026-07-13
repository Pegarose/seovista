export type ProviderMatrixStatus = "implemented" | "inapplicable";

export interface ProviderMatrixRow {
  readonly provider: "nextg" | "dataforseo" | "oauth" | "storage" | "email" | "analytics";
  readonly scenario: "success" | "unconfigured" | "unavailable" | "authorization_denial" | "rejection" | "rate_limit" | "malformed" | "timeout" | "cancellation" | "not_found" | "expired" | "unauthorized";
  readonly status: ProviderMatrixStatus;
  readonly reason: string;
}

/**
 * Executable Sprint 0 applicability matrix. Every row either maps to a typed
 * mock outcome or records why that provider does not expose the scenario.
 */
export const SPRINT_ZERO_PROVIDER_MATRIX: readonly ProviderMatrixRow[] = [
  { provider: "nextg", scenario: "success", status: "implemented", reason: "Published and authorized preview fixture reads are deterministic local HTTP responses." },
  { provider: "nextg", scenario: "unconfigured", status: "inapplicable", reason: "NextG is an in-process fixture service with no credentials." },
  { provider: "nextg", scenario: "authorization_denial", status: "implemented", reason: "Unauthorized preview requests fail closed to the public projection." },
  { provider: "dataforseo", scenario: "success", status: "implemented", reason: "A normalized local fixture and cost record are returned." },
  { provider: "dataforseo", scenario: "unconfigured", status: "implemented", reason: "The typed provider returns UNCONFIGURED without a request." },
  { provider: "dataforseo", scenario: "unavailable", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "authorization_denial", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "rejection", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "rate_limit", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "malformed", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "timeout", status: "implemented", reason: "Typed finite failure." },
  { provider: "dataforseo", scenario: "cancellation", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "success", status: "implemented", reason: "State, exchange, expiry, refresh, and encryption-boundary fixtures are deterministic." },
  { provider: "oauth", scenario: "unconfigured", status: "implemented", reason: "The typed provider returns UNCONFIGURED without authorization." },
  { provider: "oauth", scenario: "unavailable", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "authorization_denial", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "rejection", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "rate_limit", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "malformed", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "timeout", status: "implemented", reason: "Typed finite failure." },
  { provider: "oauth", scenario: "cancellation", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "success", status: "implemented", reason: "Signed put and get fixtures retain only in-memory keys." },
  { provider: "storage", scenario: "unconfigured", status: "implemented", reason: "The typed provider returns UNCONFIGURED without storage traffic." },
  { provider: "storage", scenario: "not_found", status: "implemented", reason: "Typed signed-get failure." },
  { provider: "storage", scenario: "expired", status: "implemented", reason: "Typed signed-get failure." },
  { provider: "storage", scenario: "unauthorized", status: "implemented", reason: "Typed signed-get failure." },
  { provider: "storage", scenario: "unavailable", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "authorization_denial", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "rejection", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "rate_limit", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "malformed", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "timeout", status: "implemented", reason: "Typed finite failure." },
  { provider: "storage", scenario: "cancellation", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "success", status: "implemented", reason: "Consent-preserving deduplicated local delivery intent." },
  { provider: "email", scenario: "unconfigured", status: "implemented", reason: "The typed provider returns UNCONFIGURED without delivery." },
  { provider: "email", scenario: "unavailable", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "authorization_denial", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "rejection", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "rate_limit", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "malformed", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "timeout", status: "implemented", reason: "Typed finite failure." },
  { provider: "email", scenario: "cancellation", status: "implemented", reason: "Typed finite failure." },
  { provider: "analytics", scenario: "success", status: "implemented", reason: "Only seven strict event envelopes serialize locally." },
  { provider: "analytics", scenario: "unconfigured", status: "implemented", reason: "The typed provider rejects without serialization." },
  { provider: "analytics", scenario: "rejection", status: "implemented", reason: "Unknown, unnecessary, malformed, and prohibited payloads reject without serialization." },
  { provider: "analytics", scenario: "unavailable", status: "inapplicable", reason: "Sprint 0 analytics has no transport." },
  { provider: "analytics", scenario: "authorization_denial", status: "inapplicable", reason: "Sprint 0 analytics has no credentials." },
  { provider: "analytics", scenario: "rate_limit", status: "inapplicable", reason: "Sprint 0 analytics has no transport." },
  { provider: "analytics", scenario: "malformed", status: "implemented", reason: "Malformed envelopes and property schemas reject deterministically." },
  { provider: "analytics", scenario: "timeout", status: "inapplicable", reason: "Sprint 0 analytics has no transport." },
  { provider: "analytics", scenario: "cancellation", status: "inapplicable", reason: "Sprint 0 analytics has no transport." },
] as const;
