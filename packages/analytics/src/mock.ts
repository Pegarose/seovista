import type { AnalyticsCapability, AnalyticsOutcome, AnalyticsProvider, AnalyticsRejection } from "./types.js";
import { validateAnalyticsEvent, checkProhibitedPayload } from "./events.js";

export interface MockAnalyticsOptions {
  readonly capability?: AnalyticsCapability;
  readonly now?: () => Date;
}

export function createMockAnalytics(options: MockAnalyticsOptions = {}): AnalyticsProvider {
  const capability: AnalyticsCapability = options.capability === undefined || options.capability === "mock" ? "mock" : "unconfigured";
  const now = options.now ?? (() => new Date("2026-07-01T00:00:00.000Z"));
  let sequence = 0;
  let attempted = 0;
  let accepted = 0;
  let rejected = 0;

  function reject(reason: string, field?: string): AnalyticsRejection {
    rejected += 1;
    return { success: false, accepted: false, capability, messageId: capability === "mock" ? "mock-rejected" : "mock-unconfigured", reason, field, redacted: true, serialized: false };
  }

  async function track(event: unknown): Promise<AnalyticsOutcome> {
    attempted += 1;
    if (capability === "unconfigured") return reject("Analytics provider is not configured.");

    const validation = validateAnalyticsEvent(event);
    if (!validation.success) return reject(validation.reason, validation.field);

    const prohibited = checkProhibitedPayload(validation.payload);
    if (prohibited) return reject(prohibited.reason, prohibited.field);

    sequence += 1;
    accepted += 1;
    return {
      accepted: true,
      capability: "mock",
      event: validation.payload.name,
      messageId: `mock-analytics-${now().toISOString()}-${sequence}`,
      redacted: false,
      serialized: true,
    };
  }

  return {
    capability,
    track,
    getSideEffectCounts: () => ({ attempted, accepted, rejected }),
  };
}

export function createUnconfiguredAnalytics(options: Omit<MockAnalyticsOptions, "capability"> = {}): AnalyticsProvider {
  return createMockAnalytics({ ...options, capability: "unconfigured" });
}

export type { AnalyticsRejection };
