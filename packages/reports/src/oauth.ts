import { createHash } from "node:crypto";
import type { ProviderCapability, ProviderOutcome, ProviderError } from "./types.js";

export type OAuthScenario =
  | "success"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface OAuthStateRequest {
  readonly provider: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly scenario: OAuthScenario;
}

export interface OAuthStateResult {
  readonly state: string;
  readonly expiresAt: string;
}

export interface OAuthTokenRequest {
  readonly code: string;
  readonly state: string;
  readonly redirectUri: string;
  readonly scenario: OAuthScenario;
}

export interface OAuthTokenResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly encryptedToken: string;
  readonly expiresAt: string;
  readonly scope: string;
}

export interface OAuthRefreshRequest {
  readonly refreshToken: string;
  readonly scenario: OAuthScenario;
}

export interface OAuthProvider {
  readonly capability: ProviderCapability;
  createState(request: OAuthStateRequest): Promise<ProviderOutcome<OAuthStateResult>>;
  exchange(request: OAuthTokenRequest): Promise<ProviderOutcome<OAuthTokenResult>>;
  refresh(request: OAuthRefreshRequest): Promise<ProviderOutcome<OAuthTokenResult>>;
  getSideEffectCounts(): { attempted: number; successful: number };
}

export interface MockOAuthOptions {
  readonly capability?: ProviderCapability;
  readonly encryptionKey?: string;
  readonly now?: Date | (() => Date);
  /** Required to make the source of every OAuth state and token explicit. */
  readonly identity: () => string;
}

export class OAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigurationError";
  }
}

export function createMockOAuth(options: MockOAuthOptions): OAuthProvider {
  if (typeof options.identity !== "function") {
    throw new OAuthConfigurationError("Mock OAuth requires an injected identity source.");
  }
  const capability: ProviderCapability = options.capability === undefined || options.capability === "mock" ? "mock" : "unconfigured";
  const encryptionKey = options.encryptionKey ?? "mock-encryption-key-not-for-production";
  const configuredNow = options.now;
  const now: () => Date = typeof configuredNow === "function" ? configuredNow : () => configuredNow ?? new Date("2026-07-01T00:00:00.000Z");
  const identity = options.identity;
  const states = new Map<string, { expiresAt: Date; redirectUri: string }>();
  const tokens = new Map<string, OAuthTokenResult>();
  let attempted = 0;
  let successful = 0;

  function encrypt(token: string): string {
    const hmac = createHash("sha256").update(`${encryptionKey}:${token}`).digest("hex").slice(0, 32);
    return `enc:${hmac}:${Buffer.from(token).toString("base64")}`;
  }

  function generateToken(): string {
    return identity();
  }

  function errorFor(scenario: OAuthScenario): ProviderError {
    switch (scenario) {
      case "unavailable":
        return { code: "SERVICE_UNAVAILABLE", message: "OAuth service unavailable.", retryable: true };
      case "authorization_denial":
        return { code: "AUTHORIZATION_DENIED", message: "OAuth authorization denied.", retryable: false };
      case "rejection":
        return { code: "REJECTED", message: "OAuth request rejected.", retryable: false };
      case "rate_limit":
        return { code: "RATE_LIMIT", message: "OAuth rate limit exceeded.", retryable: true };
      case "malformed":
        return { code: "MALFORMED_RESPONSE", message: "OAuth provider returned a malformed response.", retryable: true };
      case "timeout":
        return { code: "TIMEOUT", message: "OAuth request timed out.", retryable: true };
      case "cancellation":
        return { code: "CANCELLED", message: "OAuth request was cancelled.", retryable: true };
      case "success":
        return { code: "OK", message: "Success", retryable: false };
      default: {
        const _exhaustive: never = scenario;
        return { code: "UNKNOWN", message: `Unknown scenario: ${_exhaustive}`, retryable: false };
      }
    }
  }

  async function createState(request: OAuthStateRequest): Promise<ProviderOutcome<OAuthStateResult>> {
    attempted += 1;
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "OAuth provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured OAuth.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const state = generateToken();
    const expiresAt = new Date(now().getTime() + 10 * 60 * 1000);
    states.set(state, { expiresAt, redirectUri: request.redirectUri });
    successful += 1;
    return {
      capability,
      scenario: request.scenario,
      success: true,
      value: { state, expiresAt: expiresAt.toISOString() },
    };
  }

  async function exchange(request: OAuthTokenRequest): Promise<ProviderOutcome<OAuthTokenResult>> {
    attempted += 1;
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "OAuth provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured OAuth.", retryable: false } };
    }
    const stateEntry = states.get(request.state);
    if (!stateEntry || stateEntry.expiresAt.getTime() < now().getTime()) {
      return { capability, scenario: request.scenario, success: false, error: { code: "INVALID_STATE", message: "State is missing or expired.", retryable: false } };
    }
    if (stateEntry.redirectUri !== request.redirectUri) {
      return { capability, scenario: request.scenario, success: false, error: { code: "REDIRECT_URI_MISMATCH", message: "Redirect URI does not match.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const encryptedToken = encrypt(accessToken);
    const expiresAt = new Date(now().getTime() + 3600 * 1000);
    const result: OAuthTokenResult = {
      accessToken,
      refreshToken,
      encryptedToken,
      expiresAt: expiresAt.toISOString(),
      scope: request.scenario === "success" ? "read" : "",
    };
    tokens.set(refreshToken, result);
    states.delete(request.state);
    successful += 1;
    return { capability, scenario: request.scenario, success: true, value: result };
  }

  async function refresh(request: OAuthRefreshRequest): Promise<ProviderOutcome<OAuthTokenResult>> {
    attempted += 1;
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "OAuth provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured OAuth.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const existing = tokens.get(request.refreshToken);
    if (!existing) {
      return { capability, scenario: request.scenario, success: false, error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token not found.", retryable: false } };
    }
    const accessToken = generateToken();
    const encryptedToken = encrypt(accessToken);
    const expiresAt = new Date(now().getTime() + 3600 * 1000);
    const result: OAuthTokenResult = { ...existing, accessToken, encryptedToken, expiresAt: expiresAt.toISOString() };
    tokens.set(existing.refreshToken, result);
    successful += 1;
    return { capability, scenario: request.scenario, success: true, value: result };
  }

  return {
    capability,
    createState,
    exchange,
    refresh,
    getSideEffectCounts: () => ({ attempted, successful }),
  };
}

export function createUnconfiguredOAuth(options: Omit<MockOAuthOptions, "capability" | "identity"> = {}): OAuthProvider {
  return createMockOAuth({ ...options, capability: "unconfigured", identity: () => "unconfigured" });
}
