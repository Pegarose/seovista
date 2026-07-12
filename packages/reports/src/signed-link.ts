import { createHash } from "node:crypto";
import type { ProviderCapability, ProviderOutcome, ProviderError } from "./types.js";

export type SignedLinkScenario =
  | "success"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface SignedLinkRequest {
  readonly reportId: string;
  readonly expiresInSeconds: number;
  readonly scenario: SignedLinkScenario;
}

export interface SignedLinkResult {
  readonly url: string;
  readonly expiresAt: string;
  readonly reportId: string;
}

export interface SignedLinkProvider {
  readonly capability: ProviderCapability;
  createSignedLink(request: SignedLinkRequest): Promise<ProviderOutcome<SignedLinkResult>>;
}

export interface MockSignedLinkOptions {
  readonly capability?: ProviderCapability;
  readonly baseUrl?: string;
  readonly signingSecret?: string;
  readonly now?: Date;
}

export function createMockSignedLinkProvider(options: MockSignedLinkOptions = {}): SignedLinkProvider {
  const capability = options.capability ?? "mock";
  const baseUrl = options.baseUrl ?? "https://reports.seovista.local";
  const signingSecret = options.signingSecret ?? "mock-signing-secret-not-for-production";
  const now = options.now ?? new Date();

  function errorFor(scenario: SignedLinkScenario): ProviderError {
    switch (scenario) {
      case "unavailable":
        return { code: "SERVICE_UNAVAILABLE", message: "Signed link service unavailable.", retryable: true };
      case "authorization_denial":
        return { code: "AUTHORIZATION_DENIED", message: "Signed link authorization denied.", retryable: false };
      case "rejection":
        return { code: "REJECTED", message: "Signed link request rejected.", retryable: false };
      case "rate_limit":
        return { code: "RATE_LIMIT", message: "Signed link rate limit exceeded.", retryable: true };
      case "malformed":
        return { code: "MALFORMED_RESPONSE", message: "Signed link service returned a malformed response.", retryable: true };
      case "timeout":
        return { code: "TIMEOUT", message: "Signed link request timed out.", retryable: true };
      case "cancellation":
        return { code: "CANCELLED", message: "Signed link request was cancelled.", retryable: true };
      case "success":
        return { code: "OK", message: "Success", retryable: false };
      default: {
        const _exhaustive: never = scenario;
        return { code: "UNKNOWN", message: `Unknown scenario: ${_exhaustive}`, retryable: false };
      }
    }
  }

  async function createSignedLink(request: SignedLinkRequest): Promise<ProviderOutcome<SignedLinkResult>> {
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "Signed link provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured signed links.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const expiresAt = new Date(now.getTime() + request.expiresInSeconds * 1000).toISOString();
    const signature = createHash("sha256").update(`${signingSecret}:${request.reportId}:${expiresAt}`).digest("hex").slice(0, 16);
    return {
      capability,
      scenario: request.scenario,
      success: true,
      value: {
        url: `${baseUrl}/${request.reportId}?signature=${signature}&expires=${encodeURIComponent(expiresAt)}`,
        expiresAt,
        reportId: request.reportId,
      },
    };
  }

  return {
    capability,
    createSignedLink,
  };
}

export function createUnconfiguredSignedLinkProvider(options: Omit<MockSignedLinkOptions, "capability"> = {}): SignedLinkProvider {
  return createMockSignedLinkProvider({ ...options, capability: "unconfigured" });
}
