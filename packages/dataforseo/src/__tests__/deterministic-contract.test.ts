import { describe, expect, it, vi } from "vitest";
import { createMockDataForSeo, SPRINT_ZERO_PROVIDER_MATRIX } from "../index.js";

const fixedClock = (): Date => new Date("2026-07-01T00:00:00.000Z");
const request = (scenario: "success" | "unavailable" | "authorization_denial" | "rejection" | "rate_limit" | "malformed" | "timeout" | "cancellation", taskId = `task-${scenario}`) => ({
  taskId,
  target: "https://seovista.com/",
  operation: "audit",
  scenario,
});

describe("DataForSEO deterministic provider contract", () => {
  it("records every provider scenario as implemented or contract-backed inapplicable", () => {
    expect(SPRINT_ZERO_PROVIDER_MATRIX).toHaveLength(51);
    for (const row of SPRINT_ZERO_PROVIDER_MATRIX) {
      expect(row.reason).not.toHaveLength(0);
      expect(["implemented", "inapplicable"]).toContain(row.status);
    }
  });

  it("covers every applicable finite scenario with stable snapshots and exact counts", async () => {
    const provider = createMockDataForSeo({ now: fixedClock, dailyLimit: 1 });
    const success = await provider.execute(request("success"));
    expect(success).toMatchObject({ capability: "mock", success: true, result: { completedAt: "2026-07-01T00:00:00.000Z" }, cost: { amount: 0.05, recordedAt: "2026-07-01T00:00:00.000Z" } });

    for (const scenario of ["unavailable", "authorization_denial", "rejection", "rate_limit", "malformed", "timeout", "cancellation"] as const) {
      const outcome = await provider.execute(request(scenario));
      expect(outcome).toMatchObject({ capability: "mock", scenario, success: false });
      expect(outcome.cost).toBeUndefined();
    }
    expect(provider.getSideEffectCounts()).toEqual({ attempted: 8, successful: 1, costRecords: 1 });
  });

  it("enforces the cost ceiling before success, fails closed for invalid capability, and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("outbound network denied"));
    const provider = createMockDataForSeo({ now: fixedClock, dailyLimit: 0.05 });
    expect((await provider.execute(request("success", "one"))).success).toBe(true);
    const blocked = await provider.execute(request("success", "two"));
    expect(blocked).toMatchObject({ capability: "mock", success: false, error: { code: "BUDGET_EXCEEDED" }, budget: { spentToday: 0.05, remaining: 0 } });
    expect(provider.getSideEffectCounts()).toEqual({ attempted: 2, successful: 1, costRecords: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();

    const invalidCapability = createMockDataForSeo({ capability: "live" as never, now: fixedClock });
    expect(await invalidCapability.execute(request("success"))).toMatchObject({ capability: "unconfigured", success: false, error: { code: "UNCONFIGURED" } });
    fetchSpy.mockRestore();
  });
});
