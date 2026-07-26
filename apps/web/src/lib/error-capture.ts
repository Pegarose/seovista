type ErrorContext = Record<string, unknown>;

/**
 * Captures an exception for local error logging.
 *
 * @param error - The error to capture
 * @param context - Additional context to include with the error
 */
export function captureException(error: unknown, context?: ErrorContext): void {
   
  console.error("Captured exception:", error);

  if (context) {
     
    console.error("Exception context:", JSON.stringify(context, null, 2));
  }

}
