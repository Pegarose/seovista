import type { ProviderCapability, ProviderOutcome, ProviderError, UtmParams, ConsentState } from "./types.js";

export type EmailScenario =
  | "success"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface EmailAddress {
  readonly email: string;
  readonly name?: string | undefined;
}

export interface EmailPayload {
  readonly to: EmailAddress;
  readonly from: EmailAddress;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string | undefined;
  readonly consent: ConsentState;
  readonly source?: string | undefined;
  readonly utm?: UtmParams | undefined;
  readonly scenario: EmailScenario;
  readonly intent?: string | undefined;
}

export interface EmailResult {
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
  readonly deduplicated: boolean;
  readonly messageId: string;
  readonly redactedIntent: string | undefined;
}

export interface EmailProvider {
  readonly capability: ProviderCapability;
  send(payload: EmailPayload): Promise<ProviderOutcome<EmailResult>>;
  getSideEffectCounts(): { attempted: number; successful: number };
}

export interface MockEmailOptions {
  readonly capability?: ProviderCapability;
  readonly now?: Date | (() => Date);
}

export function createMockEmail(options: MockEmailOptions = {}): EmailProvider {
  const capability: ProviderCapability = options.capability === undefined || options.capability === "mock" ? "mock" : "unconfigured";
  const configuredNow = options.now;
  const now: () => Date = typeof configuredNow === "function" ? configuredNow : () => configuredNow ?? new Date("2026-07-01T00:00:00.000Z");
  const sent = new Set<string>();
  let attempted = 0;
  let successful = 0;

  function redactIntent(intent: string | undefined): string | undefined {
    if (intent === undefined) return undefined;
    if (intent.length <= 3) return "***";
    return `${intent.slice(0, 2)}***${intent.slice(-1)}`;
  }

  function deduplicationKey(payload: EmailPayload): string {
    const source = payload.source ?? "";
    const utm = payload.utm
      ? Object.entries(payload.utm)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join(";")
      : "";
    return `${payload.to.email}|${payload.subject}|${source}|${utm}`;
  }

  function errorFor(scenario: EmailScenario): ProviderError {
    switch (scenario) {
      case "unavailable":
        return { code: "SERVICE_UNAVAILABLE", message: "Email service unavailable.", retryable: true };
      case "authorization_denial":
        return { code: "AUTHORIZATION_DENIED", message: "Email credentials rejected.", retryable: false };
      case "rejection":
        return { code: "REJECTED", message: "Email rejected by provider.", retryable: false };
      case "rate_limit":
        return { code: "RATE_LIMIT", message: "Email rate limit exceeded.", retryable: true };
      case "malformed":
        return { code: "MALFORMED_RESPONSE", message: "Email provider returned a malformed response.", retryable: true };
      case "timeout":
        return { code: "TIMEOUT", message: "Email request timed out.", retryable: true };
      case "cancellation":
        return { code: "CANCELLED", message: "Email request was cancelled.", retryable: true };
      case "success":
        return { code: "OK", message: "Success", retryable: false };
      default: {
        const _exhaustive: never = scenario;
        return { code: "UNKNOWN", message: `Unknown scenario: ${_exhaustive}`, retryable: false };
      }
    }
  }

  async function send(payload: EmailPayload): Promise<ProviderOutcome<EmailResult>> {
    attempted += 1;
    if (capability === "unconfigured") {
      return { capability, scenario: payload.scenario, success: false, error: { code: "UNCONFIGURED", message: "Email provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: payload.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured email.", retryable: false } };
    }
    if (!payload.consent.marketing) {
      return { capability, scenario: payload.scenario, success: false, error: { code: "CONSENT_DENIED", message: "Marketing consent is required.", retryable: false } };
    }
    if (payload.scenario !== "success") {
      return { capability, scenario: payload.scenario, success: false, error: errorFor(payload.scenario) };
    }
    const key = deduplicationKey(payload);
    const deduplicated = sent.has(key);
    if (!deduplicated) {
      sent.add(key);
    }
    successful += deduplicated ? 0 : 1;
    return {
      capability,
      scenario: payload.scenario,
      success: true,
      value: {
        accepted: deduplicated ? [] : [payload.to.email],
        rejected: [],
        deduplicated,
        messageId: `mock-email-${now().toISOString()}-${key}`,
        redactedIntent: redactIntent(payload.intent),
      },
    };
  }

  return {
    capability,
    send,
    getSideEffectCounts: () => ({ attempted, successful }),
  };
}

export function createUnconfiguredEmail(options: Omit<MockEmailOptions, "capability"> = {}): EmailProvider {
  return createMockEmail({ ...options, capability: "unconfigured" });
}
