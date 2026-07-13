import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENT_NAMES, createMockAnalytics, createUnconfiguredAnalytics } from "../index.js";

const fixedClock = (): Date => new Date("2026-07-01T00:00:00.000Z");

const acceptedProperties = {
  tool_start: { tool: "geo-readiness-checker" },
  tool_complete: { tool: "geo-readiness-checker", status: "success" },
  audit_request: { source: "website" },
  report_request: { source: "website" },
  qualified_lead: { source: "website" },
  audit_error: { code: "TIMEOUT" },
  api_cost_recorded: { provider: "dataforseo", operation: "audit", amount: 0.05, currency: "USD" },
} as const;

describe("strict analytics mock contract", () => {
  it("accepts only the exact declared envelope and event-specific properties", async () => {
    const analytics = createMockAnalytics({ now: fixedClock });

    for (const name of ANALYTICS_EVENT_NAMES) {
      const result = await analytics.track({
        name,
        properties: acceptedProperties[name],
        timestamp: fixedClock().toISOString(),
        ...(name === "api_cost_recorded" ? {} : { correlationId: "corr-1" }),
      });
      expect(result).toMatchObject({ accepted: true, capability: "mock", event: name, redacted: false });
    }

    expect(analytics.getSideEffectCounts()).toEqual({ attempted: 7, accepted: 7, rejected: 0 });
  });

  it("rejects unknown envelope fields, unknown properties, wrong types, and every prohibited nested canary without serializing it", async () => {
    const analytics = createMockAnalytics({ now: fixedClock });
    const cases: readonly [string, unknown][] = [
      ["unknown event", { name: "unknown", properties: {}, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["unknown envelope field", { name: "tool_start", properties: acceptedProperties.tool_start, timestamp: fixedClock().toISOString(), correlationId: "corr-1", extra: true }],
      ["unknown event property", { name: "tool_start", properties: { ...acceptedProperties.tool_start, extra: true }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["wrong event property type", { name: "api_cost_recorded", properties: { ...acceptedProperties.api_cost_recorded, amount: "0.05" }, timestamp: fixedClock().toISOString() }],
      ["email", { name: "qualified_lead", properties: { source: "person@example.com" }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["secret", { name: "audit_error", properties: { code: "token=canary" }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["sensitive URL", { name: "audit_request", properties: { source: "https://example.com/?token=canary" }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["HTML", { name: "audit_error", properties: { code: "<html>canary</html>" }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["report", { name: "audit_error", properties: { code: "full audit report canary" }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
      ["nested canary", { name: "tool_start", properties: { tool: { nested: "canary" } }, timestamp: fixedClock().toISOString(), correlationId: "corr-1" }],
    ];

    for (const [_label, payload] of cases) {
      const result = await analytics.track(payload as never);
      expect(result).toMatchObject({ accepted: false, capability: "mock", serialized: false });
    }
    expect(analytics.getSideEffectCounts()).toEqual({ attempted: 10, accepted: 0, rejected: 10 });
  });

  it("uses the injected clock, fails closed for an unconfigured or invalid capability, and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("outbound network denied"));
    const analytics = createMockAnalytics({ now: fixedClock });
    const first = await analytics.track({ name: "tool_start", properties: acceptedProperties.tool_start, timestamp: fixedClock().toISOString(), correlationId: "corr-1" });
    const second = await analytics.track({ name: "tool_start", properties: acceptedProperties.tool_start, timestamp: fixedClock().toISOString(), correlationId: "corr-2" });
    expect(first).toMatchObject({ messageId: "mock-analytics-2026-07-01T00:00:00.000Z-1" });
    expect(second).toMatchObject({ messageId: "mock-analytics-2026-07-01T00:00:00.000Z-2" });
    expect(fetchSpy).not.toHaveBeenCalled();

    const unconfigured = await createUnconfiguredAnalytics({ now: fixedClock }).track({ name: "tool_start", properties: acceptedProperties.tool_start, timestamp: fixedClock().toISOString(), correlationId: "corr-1" });
    const invalidCapability = await createMockAnalytics({ capability: "live" as never, now: fixedClock }).track({ name: "tool_start", properties: acceptedProperties.tool_start, timestamp: fixedClock().toISOString(), correlationId: "corr-1" });
    expect(unconfigured).toMatchObject({ accepted: false, capability: "unconfigured" });
    expect(invalidCapability).toMatchObject({ accepted: false, capability: "unconfigured" });
    fetchSpy.mockRestore();
  });
});
