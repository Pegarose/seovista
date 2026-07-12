export const DEFAULT_ALLOWLIST: readonly string[] = [
  "id",
  "correlationId",
  "phase",
  "status",
  "outcome",
  "action",
  "subject",
  "durationMs",
  "timestamp",
  "errorClass",
  "attempt",
  "urlHostname",
  "urlScheme",
  "contentType",
  "method",
];

const DENIED_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /api[_-]?key/i,
  /auth/i,
  /authorization/i,
  /private[_-]?key/i,
  /connection[_-]?string/i,
  /dsn/i,
  /email/i,
  /html/i,
  /body/i,
  /stack/i,
  /trace/i,
];

const DENIED_VALUE_PATTERNS: readonly RegExp[] = [
  /BEGIN [A-Z ]+ KEY/,
  /sk-[a-zA-Z0-9]+/,
  /[a-f0-9]{64}/i,
  /token=[^&]+/i,
  /api[_-]?key=[^&]+/i,
];

export interface RedactionOptions {
  allowlist?: readonly string[];
  maxDepth?: number;
  replacement?: string;
}

function looksLikeSecretKey(key: string): boolean {
  return DENIED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function looksLikeSecretValue(value: string): boolean {
  return DENIED_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function redactValue(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  const replacement = options.replacement ?? "[REDACTED]";

  if (typeof value === "string") {
    if (looksLikeSecretValue(value)) {
      return replacement;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, options));
  }

  if (typeof value === "object") {
    return redactObject(
      value as Record<string, unknown>,
      options,
      (options.maxDepth ?? 10) - 1,
    );
  }

  return replacement;
}

export function redactObject(
  input: Record<string, unknown>,
  options: RedactionOptions = {},
  depth: number = (options.maxDepth ?? 10) - 1,
): Record<string, unknown> {
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST;
  const replacement = options.replacement ?? "[REDACTED]";

  if (depth < 0) {
    return { _: "[MAX_DEPTH_REACHED]" };
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (looksLikeSecretKey(key) && !allowlist.includes(key)) {
      output[key] = replacement;
      continue;
    }

    if (allowlist.includes(key) || typeof value !== "object" || value === null) {
      output[key] = redactValue(value, options);
      continue;
    }

    output[key] = redactObject(
      value as Record<string, unknown>,
      options,
      depth - 1,
    );
  }

  return output;
}

export function redactForLogging(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  return redactValue(value, options);
}

export class CanaryValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanaryValueError";
  }
}

/**
 * Throw if any allowlisted or nested value contains a literal canary string.
 * Use this to prove secrets cannot leak through serialized outcomes.
 */
export function rejectCanary(
  value: unknown,
  canary: string,
  path: string = "",
): void {
  if (typeof value === "string") {
    if (value.includes(canary)) {
      throw new CanaryValueError(
        `Canary value leaked at ${path || "<root>"}`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectCanary(item, canary, `${path}[${index}]`));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      rejectCanary(nested, canary, path ? `${path}.${key}` : key);
    }
  }
}
