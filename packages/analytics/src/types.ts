/**
 * Typed analytics event contracts. Sprint 0 supports exactly seven declared
 * events and rejects unknown events and prohibited payloads.
 */

export type AnalyticsCapability = "mock" | "unconfigured";

export type AnalyticsEventName =
  | "tool_start"
  | "tool_complete"
  | "audit_request"
  | "report_request"
  | "qualified_lead"
  | "audit_error"
  | "api_cost_recorded";

export interface AnalyticsEventPayload {
  readonly name: AnalyticsEventName;
  readonly properties: Record<string, unknown>;
  readonly timestamp: string;
  readonly correlationId?: string | undefined;
}

export interface AnalyticsResult {
  readonly accepted: true;
  readonly capability: "mock";
  readonly event: AnalyticsEventName;
  readonly messageId: string;
  readonly redacted: false;
  readonly serialized: true;
}

export interface AnalyticsRejection {
  readonly success: false;
  readonly accepted: false;
  readonly capability: AnalyticsCapability;
  readonly messageId: "mock-rejected" | "mock-unconfigured";
  readonly reason: string;
  readonly field?: string | undefined;
  readonly redacted: true;
  readonly serialized: false;
}

export interface AnalyticsSideEffectCounts {
  readonly attempted: number;
  readonly accepted: number;
  readonly rejected: number;
}

export interface AnalyticsProvider {
  readonly capability: AnalyticsCapability;
  track(event: unknown): Promise<AnalyticsOutcome>;
  getSideEffectCounts(): AnalyticsSideEffectCounts;
}

export type AnalyticsOutcome = AnalyticsResult | AnalyticsRejection;
