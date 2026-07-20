export type AnalyticsEvent = 
  | "tool_start" 
  | "tool_complete" 
  | "audit_request" 
  | "report_request" 
  | "qualified_lead" 
  | "audit_error" 
  | "api_cost_recorded";

export type EventProperties = Record<string, unknown>;

/**
 * Strips Personally Identifiable Information (PII) from event properties.
 * E.g., removes emails, passwords, session tokens.
 */
function sanitizeProperties(properties?: EventProperties): EventProperties | undefined {
  if (!properties) return undefined;

  const sanitized = { ...properties };
  
  // Basic PII filtering
  const piiKeys = ['email', 'password', 'token', 'phone', 'address'];
  
  for (const key of Object.keys(sanitized)) {
      if (piiKeys.some(pii => key.toLowerCase().includes(pii))) {
          sanitized[key] = '[REDACTED]';
      }
  }

  return sanitized;
}

/**
 * Tracks an analytics event.
 * Currently logs to console.log for development/mocking purposes.
 *
 * @param event - The precise name of the analytics event to track
 * @param properties - Optional properties/metadata associated with the event
 */
export function trackEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  const safeProperties = sanitizeProperties(properties);
  
  // Format the output consistently
  if (safeProperties && Object.keys(safeProperties).length > 0) {
    // eslint-disable-next-line no-console
    console.log("[ANALYTICS]", event, safeProperties);
  } else {
    // eslint-disable-next-line no-console
    console.log("[ANALYTICS]", event);
  }
}
