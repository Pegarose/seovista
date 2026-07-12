/**
 * Typed analytics event contracts. Sprint 0 supports exactly seven declared
 * events and rejects unknown events and prohibited payloads.
 */

export type AnalyticsCapability = "mock" | "unconfigured" | "live";

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
  readonly accepted: boolean;
  readonly event: AnalyticsEventName;
  readonly messageId: string;
  readonly redacted: boolean;
}

export interface AnalyticsProvider {
  readonly capability: AnalyticsCapability;
  track(event: AnalyticsEventPayload): Promise<AnalyticsResult>;
}

export interface AnalyticsRejection {
  readonly success: false;
  readonly accepted: false;
  readonly reason: string;
  readonly field?: string | undefined;
}

export type AnalyticsOutcome = AnalyticsResult | AnalyticsRejection;
