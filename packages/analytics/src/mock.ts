import type { AnalyticsCapability, AnalyticsEventPayload, AnalyticsProvider, AnalyticsResult, AnalyticsRejection } from "./types.js";
import { validateAnalyticsEvent, checkProhibitedPayload, redactProperties } from "./events.js";

export interface MockAnalyticsOptions {
  readonly capability?: AnalyticsCapability;
  readonly now?: Date;
}

export function createMockAnalytics(options: MockAnalyticsOptions = {}): AnalyticsProvider {
  const capability = options.capability ?? "mock";
  const now = options.now ?? new Date();
  let sequence = 0;

  async function track(event: AnalyticsEventPayload): Promise<AnalyticsResult> {
    if (capability === "unconfigured") {
      return { accepted: false, event: event.name, messageId: "mock-unconfigured", redacted: false };
    }
    if (capability !== "mock") {
      return { accepted: false, event: event.name, messageId: "mock-unsupported", redacted: false };
    }

    const validation = validateAnalyticsEvent(event);
    if (!validation.success) {
      return { accepted: false, event: event.name, messageId: "mock-rejected", redacted: true };
    }

    const prohibited = checkProhibitedPayload(validation.payload);
    if (prohibited) {
      return { accepted: false, event: event.name, messageId: "mock-rejected", redacted: true };
    }

    sequence += 1;
    const redacted = redactProperties(validation.payload.properties);
    const hasRedaction = Object.entries(redacted).some(([key]) => redacted[key] !== validation.payload.properties[key]);
    return {
      accepted: true,
      event: event.name,
      messageId: `mock-analytics-${now.toISOString()}-${sequence}`,
      redacted: hasRedaction,
    };
  }

  return {
    capability,
    track,
  };
}

export function createUnconfiguredAnalytics(options: Omit<MockAnalyticsOptions, "capability"> = {}): AnalyticsProvider {
  return createMockAnalytics({ ...options, capability: "unconfigured" });
}

export type { AnalyticsRejection };
