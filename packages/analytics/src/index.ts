export type {
  AnalyticsCapability,
  AnalyticsEventName,
  AnalyticsEventPayload,
  AnalyticsResult,
  AnalyticsSideEffectCounts,
  AnalyticsProvider,
  AnalyticsRejection,
  AnalyticsOutcome,
} from "./types.js";

export {
  ANALYTICS_EVENT_NAMES,
  isAnalyticsEventName,
  validateAnalyticsEvent,
  checkProhibitedPayload,
  redactProperties,
} from "./events.js";

export { createMockAnalytics, createUnconfiguredAnalytics, type MockAnalyticsOptions } from "./mock.js";

export const name: string = "@seovista/analytics";
