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

const analyticsEventPayloadSchema = z.object({
  name: analyticsEventNameSchema,
  properties: z.record(z.unknown()),
  timestamp: z.string().datetime(),
  correlationId: z.string().optional(),
});

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return ANALYTICS_EVENT_NAMES.includes(name as AnalyticsEventName);
}

export function validateAnalyticsEvent(raw: unknown): { success: true; payload: AnalyticsEventPayload } | AnalyticsRejection {
  const parsed = analyticsEventPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, accepted: false, reason: `Invalid analytics event: ${parsed.error.message}`, field: "event" };
  }
  return { success: true, payload: parsed.data };
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
  if (!URL_PATTERN.test(value)) return false;
  const urlMatch = URL_PATTERN.exec(value);
  if (!urlMatch) return false;
  const url = urlMatch[0];
  try {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash || parsed.username || parsed.password) return true;
  } catch {
    return true;
  }
  return false;
}

function containsProhibitedContent(value: string): boolean {
  if (containsSensitiveString(value)) return true;
  if (containsSensitiveUrl(value)) return true;
  if (value.includes("<html") || value.includes("</html>")) return true;
  if (value.includes("<!DOCTYPE") || value.includes("<body")) return true;
  if (value.includes("report content:") || value.includes("full audit report")) return true;
  return false;
}

function scanValue(value: unknown, path = "properties"): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    if (containsProhibitedContent(value)) {
      return path;
    }
    return undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return undefined;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const result = scanValue(value[i], `${path}[${i}]`);
      if (result) return result;
    }
    return undefined;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (containsProhibitedContent(key)) {
        return `${path}.${key}`;
      }
      const result = scanValue(nested, `${path}.${key}`);
      if (result) return result;
    }
    return undefined;
  }
  return path;
}

export function checkProhibitedPayload(payload: AnalyticsEventPayload): AnalyticsRejection | undefined {
  if (!payload.correlationId && payload.name !== "api_cost_recorded") {
    return { success: false, accepted: false, reason: "Correlation ID is required for this event.", field: "correlationId" };
  }
  const field = scanValue(payload.properties);
  if (field) {
    return { success: false, accepted: false, reason: "Payload contains prohibited content (email, secrets, tokens, sensitive URL, HTML, or report content).", field };
  }
  return undefined;
}

export function redactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && containsProhibitedContent(value)) {
      redacted[key] = "[redacted]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactProperties(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
