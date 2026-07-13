import { describe, it, expect } from "vitest";
import { createMockAnalytics, createUnconfiguredAnalytics, ANALYTICS_EVENT_NAMES, validateAnalyticsEvent, checkProhibitedPayload } from "../index.js";

const validProperties = {
  tool_start: { tool: "geo-readiness-checker" },
  tool_complete: { tool: "geo-readiness-checker", status: "success" },
  audit_request: { source: "website" },
  report_request: { source: "website" },
  qualified_lead: { source: "website" },
  audit_error: { code: "TIMEOUT" },
  api_cost_recorded: { provider: "dataforseo", operation: "audit", amount: 0.05, currency: "USD" },
} as const;

describe("analytics event contracts", () => {
  it("accepts all seven declared events", async () => {
    const analytics = createMockAnalytics();
    for (const name of ANALYTICS_EVENT_NAMES) {
      const result = await analytics.track({
        name,
        properties: validProperties[name],
        timestamp: "2026-07-01T00:00:00.000Z",
        ...(name === "api_cost_recorded" ? {} : { correlationId: "corr-1" }),
      });
      expect(result.accepted).toBe(true);
      if (result.accepted) expect(result.event).toBe(name);
    }
  });

  it("rejects unknown events", async () => {
    const analytics = createMockAnalytics();
    const result = await analytics.track({
      name: "custom_event" as "tool_start",
      properties: {},
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects payloads containing email", async () => {
    const analytics = createMockAnalytics();
    const result = await analytics.track({
      name: "qualified_lead",
      properties: { leadEmail: "user@example.com" },
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects payloads containing tokens", async () => {
    const analytics = createMockAnalytics();
    const result = await analytics.track({
      name: "audit_request",
      properties: { token: "Bearer abc123secret" },
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects payloads containing sensitive URLs", async () => {
    const analytics = createMockAnalytics();
    const result = await analytics.track({
      name: "audit_request",
      properties: { target: "https://example.com/?token=secret" },
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("rejects payloads containing HTML", async () => {
    const analytics = createMockAnalytics();
    const result = await analytics.track({
      name: "audit_error",
      properties: { body: "<html><body>error</body></html>" },
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("redacts prohibited nested values", () => {
    const redacted = checkProhibitedPayload({
      name: "audit_error",
      properties: { nested: { secret: "api-key-123" } },
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(redacted).toBeDefined();
    if (redacted) {
      expect(redacted.accepted).toBe(false);
    }
  });

  it("is unconfigured when capability is unconfigured", async () => {
    const analytics = createUnconfiguredAnalytics();
    const result = await analytics.track({
      name: "tool_start",
      properties: {},
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(result.accepted).toBe(false);
  });

  it("validates event schema", () => {
    const valid = validateAnalyticsEvent({
      name: "tool_start",
      properties: validProperties.tool_start,
      timestamp: "2026-07-01T00:00:00.000Z",
      correlationId: "corr-1",
    });
    expect(valid.success).toBe(true);
    const invalid = validateAnalyticsEvent({ name: "unknown" });
    expect(invalid.success).toBe(false);
  });
});
