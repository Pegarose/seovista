import { z } from "zod";
import type { AnalyticsEventName, AnalyticsEventPayload, AnalyticsRejection } from "./types.js";

export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  "tool_start",
  "tool_complete",
  "audit_request",
  "report_request",
  "qualified_lead",
  "audit_error",
  "api_cost_recorded",
];

const analyticsEventNameSchema = z.enum([
  "tool_start",
  "tool_complete",
  "audit_request",
  "report_request",
  "qualified_lead",
  "audit_error",
  "api_cost_recorded",
]);

const propertySchemas = {
  tool_start: z.object({ tool: z.string().min(1) }).strict(),
  tool_complete: z.object({ tool: z.string().min(1), status: z.literal("success") }).strict(),
  audit_request: z.object({ source: z.string().min(1) }).strict(),
  report_request: z.object({ source: z.string().min(1) }).strict(),
  qualified_lead: z.object({ source: z.string().min(1) }).strict(),
  audit_error: z.object({ code: z.string().min(1) }).strict(),
  api_cost_recorded: z.object({
    provider: z.literal("dataforseo"),
    operation: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict(),
} as const;

const analyticsEventPayloadSchema = z.object({
  name: analyticsEventNameSchema,
  properties: z.record(z.unknown()),
  timestamp: z.string().datetime(),
  correlationId: z.string().min(1).optional(),
}).strict();

function rejection(reason: string, field?: string): AnalyticsRejection {
  return {
    success: false,
    accepted: false,
    capability: "mock",
    messageId: "mock-rejected",
    reason,
    field,
    redacted: true,
    serialized: false,
  };
}

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return ANALYTICS_EVENT_NAMES.includes(name as AnalyticsEventName);
}

export function validateAnalyticsEvent(raw: unknown): { success: true; payload: AnalyticsEventPayload } | AnalyticsRejection {
  const parsed = analyticsEventPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return rejection("Invalid analytics envelope.", "event");
  }
  const properties = propertySchemas[parsed.data.name].safeParse(parsed.data.properties);
  if (!properties.success) {
    return rejection("Analytics properties do not match the declared event schema.", "properties");
  }
  return { success: true, payload: { ...parsed.data, properties: properties.data } };
}

const SENSITIVE_VALUE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /password\s*[:=]\s*[^\s&]+/i,
  /token\s*[:=]\s*[^\s&]+/i,
  /secret\s*[:=]\s*[^\s&]+/i,
  /api[_-]?key\s*[:=]\s*[^\s&]+/i,
  /bearer\s+[a-zA-Z0-9\-_]+/i,
];

const SENSITIVE_KEY_NAMES = ["password", "token", "secret", "api_key", "apikey", "bearer"];
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;

function containsSensitiveString(value: string): boolean {
  if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  const lower = value.toLowerCase();
  return SENSITIVE_KEY_NAMES.some((name) => lower === name || lower.startsWith(`${name}_`) || lower.endsWith(`_${name}`));
}

function containsSensitiveUrl(value: string): boolean {
  const urlMatch = value.match(URL_PATTERN);
  if (!urlMatch) return false;
  try {
    const parsed = new URL(urlMatch[0]);
    return Boolean(parsed.search || parsed.hash || parsed.username || parsed.password);
  } catch {
    return true;
  }
}

function containsProhibitedContent(value: string): boolean {
  return containsSensitiveString(value)
    || containsSensitiveUrl(value)
    || /<\/?(?:html|body)\b|<!doctype/i.test(value)
    || /report content:|full audit report/i.test(value);
}

function scanValue(value: unknown, path = "properties"): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return containsProhibitedContent(value) ? path : undefined;
  if (typeof value === "number" || typeof value === "boolean") return undefined;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const result = scanValue(value[i], `${path}[${i}]`);
      if (result) return result;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (containsProhibitedContent(key)) return `${path}.${key}`;
      const result = scanValue(nested, `${path}.${key}`);
      if (result) return result;
    }
    return undefined;
  }
  return path;
}

export function checkProhibitedPayload(payload: AnalyticsEventPayload): AnalyticsRejection | undefined {
  if (!payload.correlationId && payload.name !== "api_cost_recorded") {
    return rejection("Correlation ID is required for this event.", "correlationId");
  }
  const field = scanValue(payload.properties);
  return field ? rejection("Payload contains prohibited content.", field) : undefined;
}

export function redactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, scanValue(value, key) || containsProhibitedContent(key) ? "[redacted]" : value]));
}
