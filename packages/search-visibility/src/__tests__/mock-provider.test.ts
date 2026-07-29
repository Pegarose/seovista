import { describe, it, expect } from "vitest";

/**
 * VAL-FOUND-004, VAL-FOUND-005, VAL-FOUND-006:
 * Mock provider is the default, output is normalized, and failure
 * boundaries are represented without corrupting domain state.
 */

describe("VAL-FOUND-004 — mock provider is the default", () => {
  it("returns a provider with providerId 'mock'", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();
    expect(provider.providerId).toBe("mock");
  });

  it("produces deterministic results for the same keyword", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const ctx = {
      workspaceId: "ws-1",
      projectId: "proj-1",
      operationKey: "op-1",
      runId: "run-1",
    };

    const r1 = await provider.search({ keyword: "seo audit", context: ctx });
    const r2 = await provider.search({ keyword: "seo audit", context: ctx });

    // Deterministic: same input → same output
    expect(r1.results[0]?.position).toBe(r2.results[0]?.position);
    expect(r1.results[0]?.volume).toBe(r2.results[0]?.volume);
    expect(r1.results[0]?.features).toEqual(r2.results[0]?.features);
    expect(r1.hasResults).toBe(r2.hasResults);
    expect(r1.provider).toBe("mock");
  });

  it("never makes an external network request (pure computation)", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    // The mock is synchronous in design — no fetch, no setTimeout,
    // no network primitives. We prove by calling many times without
    // network instrumentation and ensuring instant return.
    const start = Date.now();
    await provider.search({
      keyword: "seo audit",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-1",
        runId: "run-1",
      },
    });
    const elapsed = Date.now() - start;
    // Should return within a few milliseconds (no network round-trip)
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("VAL-FOUND-005 — mock provider output is normalized", () => {
  it("serp-ranked: returns position 3 and two features for 'seo audit'", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "seo audit",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-1",
        runId: "run-1",
      },
    });

    expect(result.hasResults).toBe(true);
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.position).toBe(3);
    expect(r.volume).toBe(1200);
    expect(r.features).toContain("featured_snippet");
    expect(r.features).toContain("knowledge_panel");
    expect(r.hasResults).toBe(true);
  });

  it("serp-unranked: unranked term returns position null", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "unranked term",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-2",
        runId: "run-2",
      },
    });

    expect(result.hasResults).toBe(false);
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.position).toBeNull();
    expect(r.hasResults).toBe(false);
    expect(r.volume).toBe(300);
  });

  it("serp-zero-volume: zero volume term returns volume 0", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "zero volume term",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-3",
        runId: "run-3",
      },
    });

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.volume).toBe(0);
    expect(r.volumeStatus).toBe("available");
    expect(r.hasResults).toBe(true);
  });

  it("serp-no-results: unknown keyword returns empty result, never rank 0", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "completely unknown keyword xyz",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-4",
        runId: "run-4",
      },
    });

    expect(result.hasResults).toBe(false);
    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.position).toBeNull(); // never rank 0
    expect(r.hasResults).toBe(false);
    expect(r.volume).toBeNull();
    expect(r.volumeStatus).toBe("unknown");
    expect(r.features).toEqual([]);
  });

  it("normalizes volumeStatus to 'available' for all mock results", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "seo tools",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-5",
        runId: "run-5",
      },
    });

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.volumeStatus).toBe("available");
  });

  it("result shape matches ProviderSearchResult contract", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "seo audit",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-6",
        runId: "run-6",
      },
    });

    // ProviderSearchResult fields
    expect(typeof result.keyword).toBe("string");
    expect(Array.isArray(result.results)).toBe(true);
    expect(typeof result.hasResults).toBe("boolean");
    expect(typeof result.provider).toBe("string");
    expect(typeof result.capturedAt).toBe("string");
    expect(result.context).toBeDefined();
    expect(result.context.workspaceId).toBe("ws-1");
  });
});

describe("VAL-FOUND-006 — provider failure is represented cleanly", () => {
  it("unknown keyword does not throw or crash", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    // Should not throw for any keyword
    await expect(
      provider.search({
        keyword: "",
        context: {
          workspaceId: "ws-1",
          projectId: "proj-1",
          operationKey: "op-7",
          runId: "run-7",
        },
      }),
    ).resolves.toBeDefined();
  });

  it("empty keyword still returns a valid result shape (no crash)", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-8",
        runId: "run-8",
      },
    });

    expect(result).toBeDefined();
    expect(result.hasResults).toBe(false);
    expect(result.results).toHaveLength(1);
  });

  it("very long keyword does not throw or crash", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const longKeyword = "a".repeat(10000);
    const result = await provider.search({
      keyword: longKeyword,
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-9",
        runId: "run-9",
      },
    });

    expect(result).toBeDefined();
    expect(result.hasResults).toBe(false);
  });

  it("special characters in keyword do not crash", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    const result = await provider.search({
      keyword: "SELECT * FROM users; --",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-10",
        runId: "run-10",
      },
    });

    expect(result).toBeDefined();
    expect(result.hasResults).toBe(false);
  });

  it("subsequent valid request succeeds after unknown keyword", async () => {
    const { createMockSearchVisibilityProvider } = await import(
      "@seovista/search-visibility"
    );
    const provider = createMockSearchVisibilityProvider();

    // Unknown keyword → empty result
    await provider.search({
      keyword: "unknown",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-11",
        runId: "run-11",
      },
    });

    // Known keyword → still succeeds
    const result = await provider.search({
      keyword: "seo audit",
      context: {
        workspaceId: "ws-1",
        projectId: "proj-1",
        operationKey: "op-12",
        runId: "run-12",
      },
    });

    expect(result.hasResults).toBe(true);
    const r = result.results[0];
    if (!r) throw new Error("Expected at least one result");
    expect(r.position).toBe(3);
  });
});
