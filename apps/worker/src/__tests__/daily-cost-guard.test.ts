import { describe, it, expect, vi } from "vitest";
import { checkDailyCostLimit, type CostRepository } from "../db/cost.js";

describe("Daily Cost Guard", () => {
  it("allows audits when daily cost is below AUDIT_DAILY_COST_LIMIT", async () => {
    const mockRepo: Partial<CostRepository> = {
      totalForDay: vi.fn().mockResolvedValue({ amount: "50.00", count: 5 }),
    };

    const result = await checkDailyCostLimit(mockRepo as CostRepository, 100);

    expect(result.allowed).toBe(true);
    expect(result.currentCost).toBe(50);
    expect(result.limit).toBe(100);
  });

  it("blocks audits when daily cost meets or exceeds AUDIT_DAILY_COST_LIMIT", async () => {
    const mockRepo: Partial<CostRepository> = {
      totalForDay: vi.fn().mockResolvedValue({ amount: "100.50", count: 10 }),
    };

    const result = await checkDailyCostLimit(mockRepo as CostRepository, 100);

    expect(result.allowed).toBe(false);
    expect(result.currentCost).toBe(100.5);
  });

  it("allows audits when limit is not configured (undefined or 0)", async () => {
    const mockRepo: Partial<CostRepository> = {
      totalForDay: vi.fn().mockResolvedValue({ amount: "500.00", count: 50 }),
    };

    const result = await checkDailyCostLimit(mockRepo as CostRepository, undefined);

    expect(result.allowed).toBe(true);
  });
});
