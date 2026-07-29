/**
 * Stable typed error codes and constructors.
 *
 * Every public failure is a stable serializable code with retryability,
 * safe message, and optional operation/request identity. Raw provider
 * fields and errors never cross the package boundary.
 */

/** The set of stable typed error codes that may appear on public failures. */
export const typedErrorCodes = {
  validation: {
    blank: "validation.blank",
    too_long: "validation.too_long",
    malformed: "validation.malformed",
  },
  conflict: {
    duplicate: "conflict.duplicate",
  },
  ownership: {
    invalid: "ownership.invalid",
  },
  auth: {
    unauthenticated: "auth.unauthenticated",
    forbidden: "auth.forbidden",
  },
  provider: {
    timeout: "provider.timeout",
    rate_limited: "provider.rate_limited",
    unavailable: "provider.unavailable",
    unauthorized: "provider.unauthorized",
    malformed: "provider.malformed",
    not_opted_in: "provider.not_opted_in",
    credentials_missing: "provider.credentials_missing",
    selection_invalid: "provider.selection_invalid",
  },
  resource: {
    not_found: "resource.not_found",
  },
  operation: {
    cancelled: "operation.cancelled",
    expired: "operation.expired",
  },
} as const;

/** Input fields for constructing a typed error. */
export interface TypedErrorInput {
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
  readonly operationKey?: string;
  readonly requestId?: string;
}

/** A stable, serializable public failure. */
export interface TypedError {
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
  readonly operationKey?: string;
  readonly requestId?: string;
}

/** Create a stable typed error with the given fields. */
export function createTypedError(input: TypedErrorInput): TypedError {
  const err: TypedError = {
    code: input.code,
    retryable: input.retryable,
    message: input.message,
  };
  if (input.operationKey !== undefined) {
    (err as { operationKey?: string }).operationKey = input.operationKey;
  }
  if (input.requestId !== undefined) {
    (err as { requestId?: string }).requestId = input.requestId;
  }
  return err;
}

/** Type guard: true when the value is a typed normalization error. */
export function isNormalizationError(value: unknown): value is TypedError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "retryable" in value &&
    "message" in value &&
    typeof (value as TypedError).code === "string" &&
    typeof (value as TypedError).retryable === "boolean" &&
    typeof (value as TypedError).message === "string"
  );
}
