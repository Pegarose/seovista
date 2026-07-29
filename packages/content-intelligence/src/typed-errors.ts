/**
 * Stable typed error codes shared by the content-intelligence package.
 *
 * These codes match the canonical error vocabulary defined in the
 * validation contract. Every public failure carries a code, retryability,
 * and safe message.
 */

/** The set of stable typed error codes. */
export const typedErrorCodes = {
  validation: {
    blank: "validation.blank",
    too_long: "validation.too_long",
    malformed: "validation.malformed",
  },
  provider: {
    timeout: "provider.timeout",
    rate_limited: "provider.rate_limited",
    unavailable: "provider.unavailable",
  },
  resource: {
    not_found: "resource.not_found",
  },
  operation: {
    cancelled: "operation.cancelled",
  },
} as const;

/** Input fields for constructing a typed error. */
export interface TypedErrorInput {
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
}

/** A stable, serializable public failure. */
export interface TypedError {
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
}

/** Create a stable typed error with the given fields. */
export function createTypedError(input: TypedErrorInput): TypedError {
  return {
    code: input.code,
    retryable: input.retryable,
    message: input.message,
  };
}
