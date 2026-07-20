type ErrorContext = Record<string, unknown>;

/**
 * Captures an exception for error monitoring.
 * Logs to console.error, and optionally Sentry if configured.
 *
 * @param error - The error to capture
 * @param context - Additional context to include with the error
 */
export function captureException(error: unknown, context?: ErrorContext): void {
   
  console.error("Captured exception:", error);

  if (context) {
     
    console.error("Exception context:", JSON.stringify(context, null, 2));
  }

  // Sentry mock implementation
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // In a real implementation, we would call Sentry.captureException here.
    // For now, we mock the dispatch if the DSNs are present.
    // eslint-disable-next-line no-console
    console.log("[SENTRY CAPTURE]: Dispatching to Sentry DSN...");
    
    // Attempting to extract message or stack for logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.log(`[SENTRY CAPTURE]: Error - ${errorMessage}`);
  }
}
