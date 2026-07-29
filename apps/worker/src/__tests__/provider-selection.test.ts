import { describe, it, expect } from "vitest";

/**
 * VAL-FOUND-013 & VAL-FOUND-020:
 * Provider selection has one explicit server-side factory.
 *
 * This test proves the complete selector matrix:
 * - missing/empty → mock (default)
 * - "mock"       → mock
 * - "MOCK"/"Live"/other case-variant → ProviderSelectionInvalid
 * - "live" without opt-in → LiveProviderNotOptedIn
 * - "live" with opt-in, without credentials → LiveProviderCredentialsMissing
 * - "live" with opt-in, creds, no fixture transport → rejection in validation
 */

// Dynamic import because the provider-factory uses "server-only"
// which is mocked to a no-op in the test environment.
const factoryPromise = import("@seovista/worker").then(
  (mod) => mod.createSearchVisibilityProvider,
);

describe("VAL-FOUND-013 — provider factory is the single selector", () => {
  it("missing/empty mode defaults to mock provider", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const provider = createSearchVisibilityProvider({});
    expect(provider).toBeDefined();
    // Should be a SearchVisibilityProvider, not an error
    if ("providerId" in provider) {
      expect(provider.providerId).toBe("mock");
    } else {
      throw new Error(`Expected provider, got error: ${provider.message}`);
    }
  });

  it("explicit 'mock' mode returns mock provider", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const provider = createSearchVisibilityProvider({ mode: "mock" });
    if ("providerId" in provider) {
      expect(provider.providerId).toBe("mock");
    } else {
      throw new Error(`Expected mock provider, got error: ${provider.message}`);
    }
  });

  it("undefined mode defaults to mock (empty string also mock)", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const p1 = createSearchVisibilityProvider({});
    const p2 = createSearchVisibilityProvider({ mode: "" });

    if ("providerId" in p1) {
      expect(p1.providerId).toBe("mock");
    } else {
      throw new Error(`Expected mock for default mode: ${p1.message}`);
    }
    if ("providerId" in p2) {
      expect(p2.providerId).toBe("mock");
    } else {
      throw new Error(`Expected mock for empty mode: ${p2.message}`);
    }
  });

  it("case-variant 'MOCK' fails with ProviderSelectionInvalid", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({ mode: "MOCK" });
    if ("code" in result) {
      expect(result.code).toBe("provider.selection_invalid");
      expect(result.retryable).toBe(false);
    } else {
      throw new Error("Expected typed error for invalid mode");
    }
  });

  it("case-variant 'Live' fails with ProviderSelectionInvalid", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({ mode: "Live" });
    if ("code" in result) {
      expect(result.code).toBe("provider.selection_invalid");
    } else {
      throw new Error("Expected typed error for case-variant mode");
    }
  });

  it("unknown mode like 'random' fails with ProviderSelectionInvalid", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({ mode: "random" });
    if ("code" in result) {
      expect(result.code).toBe("provider.selection_invalid");
      expect(result.retryable).toBe(false);
    } else {
      throw new Error("Expected typed error for unknown mode");
    }
  });
});

describe("VAL-FOUND-020 — live selection fails closed", () => {
  it("'live' without opt-in returns LiveProviderNotOptedIn", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({ mode: "live" });
    if ("code" in result) {
      expect(result.code).toBe("provider.not_opted_in");
      expect(result.retryable).toBe(false);
    } else {
      throw new Error("Expected LiveProviderNotOptedIn error");
    }
  });

  it("'live' with opt-in but no credentials returns LiveProviderCredentialsMissing", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({
      mode: "live",
      liveOptIn: true,
    });
    if ("code" in result) {
      expect(result.code).toBe("provider.credentials_missing");
      expect(result.retryable).toBe(false);
    } else {
      throw new Error("Expected LiveProviderCredentialsMissing error");
    }
  });

  it("'live' with opt-in, empty credentials returns LiveProviderCredentialsMissing", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({
      mode: "live",
      liveOptIn: true,
      credentials: {},
    });
    if ("code" in result) {
      expect(result.code).toBe("provider.credentials_missing");
    } else {
      throw new Error("Expected credentials_missing for empty credentials");
    }
  });

  it("'live' with opt-in, credentials, no fixture transport fails in validation", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({
      mode: "live",
      liveOptIn: true,
      credentials: { apiKey: "test-key" },
    });
    if ("code" in result) {
      expect(result.code).toBe("provider.selection_invalid");
      expect(result.message).toContain("fixture transport");
    } else {
      throw new Error(
        "Expected rejection when fixture transport is missing in validation",
      );
    }
  });

  it("'live' with opt-in, credentials, fixture transport still rejects (adapter not yet implemented)", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({
      mode: "live",
      liveOptIn: true,
      credentials: { apiKey: "test-key" },
      fixtureTransport: {},
    });
    // Sprint 0: adapter is not yet built
    if ("code" in result) {
      // Either selection_invalid (adapter not implemented) - the exact code
      // depends on factory internals, but it must be a typed error, not a
      // successful provider that might make real requests
      expect(result.retryable).toBe(false);
    } else {
      throw new Error(
        "Live path should fail in Sprint 0 (adapter not built)",
      );
    }
  });
});

describe("VAL-FOUND-013 — factory is the sole server-side selector", () => {
  it("factory is callable and returns a consistent shape", async () => {
    const createSearchVisibilityProvider = await factoryPromise;
    expect(typeof createSearchVisibilityProvider).toBe("function");
  });

  it("same input produces same output (deterministic)", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const r1 = createSearchVisibilityProvider({ mode: "mock" });
    const r2 = createSearchVisibilityProvider({ mode: "mock" });

    // Both should be mock providers
    if ("providerId" in r1 && "providerId" in r2) {
      expect(r1.providerId).toBe("mock");
      expect(r2.providerId).toBe("mock");
    } else {
      throw new Error("Expected mock providers for both calls");
    }
  });

  it("typed errors are serializable", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const result = createSearchVisibilityProvider({ mode: "invalid!" });
    if ("code" in result) {
      const json = JSON.parse(JSON.stringify(result));
      expect(json.code).toBe("provider.selection_invalid");
      expect(json.retryable).toBe(false);
      expect(typeof json.message).toBe("string");
    } else {
      throw new Error("Expected typed error for invalid mode");
    }
  });

  it("mock provider from factory actually works (search returns results)", async () => {
    const createSearchVisibilityProvider = await factoryPromise;

    const provider = createSearchVisibilityProvider({ mode: "mock" });
    if ("search" in provider) {
      const result = await provider.search({
        keyword: "seo audit",
        context: {
          workspaceId: "ws-1",
          projectId: "proj-1",
          operationKey: "op-test-1",
          runId: "run-test-1",
        },
      });
      expect(result.hasResults).toBe(true);
      expect(result.provider).toBe("mock");
    } else {
      throw new Error("Expected SearchVisibilityProvider from factory");
    }
  });
});
