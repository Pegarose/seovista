import type { ProviderCapability, ProviderOutcome, ProviderError } from "./types.js";

export type StorageScenario =
  | "success"
  | "not_found"
  | "expired"
  | "unauthorized"
  | "unavailable"
  | "authorization_denial"
  | "rejection"
  | "rate_limit"
  | "malformed"
  | "timeout"
  | "cancellation";

export interface SignedPutRequest {
  readonly key: string;
  readonly contentType: string;
  readonly expiresInSeconds: number;
  readonly scenario: StorageScenario;
}

export interface SignedPutResult {
  readonly url: string;
  readonly expiresAt: string;
  readonly key: string;
}

export interface SignedGetRequest {
  readonly key: string;
  readonly expiresInSeconds: number;
  readonly scenario: StorageScenario;
}

export interface SignedGetResult {
  readonly url: string;
  readonly expiresAt: string;
  readonly key: string;
}

export interface StorageProvider {
  readonly capability: ProviderCapability;
  signedPut(request: SignedPutRequest): Promise<ProviderOutcome<SignedPutResult, StorageScenario>>;
  signedGet(request: SignedGetRequest): Promise<ProviderOutcome<SignedGetResult, StorageScenario>>;
}

export interface MockStorageOptions {
  readonly capability?: ProviderCapability;
  readonly endpoint?: string;
  readonly bucket?: string;
  readonly now?: Date;
}

export function createMockStorage(options: MockStorageOptions = {}): StorageProvider {
  const capability = options.capability ?? "mock";
  const endpoint = options.endpoint ?? "https://storage.seovista.local";
  const bucket = options.bucket ?? "seovista-reports";
  const now = options.now ?? new Date();
  const store = new Set<string>();

  function errorFor(scenario: StorageScenario): ProviderError {
    switch (scenario) {
      case "unavailable":
        return { code: "SERVICE_UNAVAILABLE", message: "Storage service unavailable.", retryable: true };
      case "authorization_denial":
      case "unauthorized":
        return { code: "AUTHORIZATION_DENIED", message: "Storage credentials rejected.", retryable: false };
      case "rejection":
        return { code: "REJECTED", message: "Storage request rejected.", retryable: false };
      case "rate_limit":
        return { code: "RATE_LIMIT", message: "Storage rate limit exceeded.", retryable: true };
      case "malformed":
        return { code: "MALFORMED_RESPONSE", message: "Storage returned a malformed response.", retryable: true };
      case "timeout":
        return { code: "TIMEOUT", message: "Storage request timed out.", retryable: true };
      case "cancellation":
        return { code: "CANCELLED", message: "Storage request was cancelled.", retryable: true };
      case "not_found":
        return { code: "NOT_FOUND", message: "Object not found.", retryable: false };
      case "expired":
        return { code: "EXPIRED", message: "Signed URL expired.", retryable: false };
      case "success":
        return { code: "OK", message: "Success", retryable: false };
      default: {
        const _exhaustive: never = scenario;
        return { code: "UNKNOWN", message: `Unknown scenario: ${_exhaustive}`, retryable: false };
      }
    }
  }

  async function signedPut(request: SignedPutRequest): Promise<ProviderOutcome<SignedPutResult, StorageScenario>> {
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "Storage provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured storage.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const expiresAt = new Date(now.getTime() + request.expiresInSeconds * 1000).toISOString();
    store.add(request.key);
    return {
      capability,
      scenario: request.scenario,
      success: true,
      value: {
        url: `${endpoint}/${bucket}/${request.key}?signature=mock-signed&expires=${encodeURIComponent(expiresAt)}`,
        expiresAt,
        key: request.key,
      },
    };
  }

  async function signedGet(request: SignedGetRequest): Promise<ProviderOutcome<SignedGetResult, StorageScenario>> {
    if (capability === "unconfigured") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNCONFIGURED", message: "Storage provider is not configured.", retryable: false } };
    }
    if (capability !== "mock") {
      return { capability, scenario: request.scenario, success: false, error: { code: "UNSUPPORTED_CAPABILITY", message: "Sprint 0 only supports mock or unconfigured storage.", retryable: false } };
    }
    if (request.scenario === "not_found" || (request.scenario === "success" && !store.has(request.key))) {
      return { capability, scenario: request.scenario, success: false, error: { code: "NOT_FOUND", message: `Object not found: ${request.key}`, retryable: false } };
    }
    if (request.scenario === "expired") {
      return { capability, scenario: request.scenario, success: false, error: { code: "EXPIRED", message: "Signed URL expired.", retryable: false } };
    }
    if (request.scenario !== "success") {
      return { capability, scenario: request.scenario, success: false, error: errorFor(request.scenario) };
    }
    const expiresAt = new Date(now.getTime() + request.expiresInSeconds * 1000).toISOString();
    return {
      capability,
      scenario: request.scenario,
      success: true,
      value: {
        url: `${endpoint}/${bucket}/${request.key}?signature=mock-signed&expires=${encodeURIComponent(expiresAt)}`,
        expiresAt,
        key: request.key,
      },
    };
  }

  return {
    capability,
    signedPut,
    signedGet,
  };
}

export function createUnconfiguredStorage(options: Omit<MockStorageOptions, "capability"> = {}): StorageProvider {
  return createMockStorage({ ...options, capability: "unconfigured" });
}
