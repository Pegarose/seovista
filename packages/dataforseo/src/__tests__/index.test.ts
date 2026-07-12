import { describe, it, expect } from "vitest";
import { createMockDataForSeo, createUnconfiguredDataForSeo } from "../index.js";

describe("dataforseo mock provider", () => {
  it("never reports live production success", async () => {
    const provider = createMockDataForSeo();
    const result = await provider.execute({
      taskId: "task-1",
      target: "https://seovista.com/",
      operation: "audit",
      scenario: "success",
    });
    expect(result.success).toBe(true);
    expect(result.capability).toBe("mock");
    expect(result.result).toBeDefined();
    expect(result.result?.limitations).toContain("Sprint 0 mock result; no live crawl performed.");
  });

  it("returns unconfigured for missing credentials", async () => {
    const provider = createUnconfiguredDataForSeo();
    const result = await provider.execute({
      taskId: "task-2",
      target: "https://seovista.com/",
      operation: "audit",
      scenario: "success",
    });
    expect(result.success).toBe(false);
    expect(result.capability).toBe("unconfigured");
  });

  it("covers all required scenarios", async () => {
    const scenarios = [
      "unavailable",
      "authorization_denial",
      "rejection",
      "rate_limit",
      "malformed",
      "timeout",
      "cancellation",
    ] as const;
    const provider = createMockDataForSeo();
    for (const scenario of scenarios) {
      const result = await provider.execute({
        taskId: `task-${scenario}`,
        target: "https://seovista.com/",
        operation: "audit",
        scenario,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.capability).toBe("mock");
    }
  });

  it("records cost and budget deterministically", async () => {
    const provider = createMockDataForSeo({ dailyLimit: 1 });
    const first = await provider.execute({
      taskId: "task-cost-1",
      target: "https://seovista.com/",
      operation: "audit",
      scenario: "success",
    });
    expect(first.cost).toBeDefined();
    expect(first.budget?.remaining).toBeGreaterThan(0);
    const budget = provider.getBudget();
    expect(budget.spentToday).toBe(first.cost?.amount);
  });
});
