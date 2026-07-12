/**
 * Shared types for reports, storage, email, and OAuth contracts. Sprint 0 uses
 * deterministic mocks only; no live provider traffic is made.
 */

export type ProviderCapability = "mock" | "unconfigured" | "live";

export type ProviderScenario =
  | "success"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface ProviderError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ProviderOutcome<T, S extends string = ProviderScenario> {
  readonly capability: ProviderCapability;
  readonly scenario: S;
  readonly success: boolean;
  readonly value?: T | undefined;
  readonly error?: ProviderError | undefined;
}

export interface UtmParams {
  readonly source?: string | undefined;
  readonly medium?: string | undefined;
  readonly campaign?: string | undefined;
  readonly content?: string | undefined;
  readonly term?: string | undefined;
}

export interface ConsentState {
  readonly marketing: boolean;
  readonly analytics: boolean;
  readonly timestamp: string;
}
