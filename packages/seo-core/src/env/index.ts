import "server-only";

import type { z } from "zod";
import {
  combinedEnvSchema,
  publicEnvSchema,
  serverEnvSchema,
  webEnvSchema,
  workerEnvSchema,
} from "./schema";
import { parsePublicEnv } from "./client";
import { parseServerEnv } from "./server";
import { ENV_VARIABLES } from "./manifest";

export type { PublicEnv, ServerEnv } from "./types";
export {
  combinedEnvSchema,
  publicEnvSchema,
  serverEnvSchema,
  webEnvSchema,
  workerEnvSchema,
};
export { parsePublicEnv, parseServerEnv };
export { ENV_VARIABLES };

export interface EnvValidationResult {
  success: boolean;
  public: {
    NEXT_PUBLIC_SITE_URL: string;
    NEXT_PUBLIC_ANALYTICS_ID?: string | undefined;
  };
  server?: Record<string, unknown>;
  diagnostics?: string[];
}

function redactedDiagnostics(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Validate the complete environment at boot.
 *
 * This function must run only in server code; it imports both public and
 * server-only schemas. On failure it returns field-specific diagnostics that
 * never contain the raw value of secret variables.
 */
export function validateEnv(source: Record<string, string | undefined>): {
  env: {
    NEXT_PUBLIC_SITE_URL: string;
    NEXT_PUBLIC_ANALYTICS_ID?: string | undefined;
    DATABASE_URL: string;
    REDIS_URL: string;
    NEXTG_API_URL: string;
    NEXTG_API_TOKEN?: string | undefined;
    DATAFORSEO_API_KEY?: string | undefined;
    GOOGLE_CLIENT_ID?: string | undefined;
    GOOGLE_CLIENT_SECRET?: string | undefined;
    GOOGLE_REDIRECT_URI?: string | undefined;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_BUCKET?: string | undefined;
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    EMAIL_PROVIDER_API_KEY?: string | undefined;
    EMAIL_FROM?: string | undefined;
    SENTRY_DSN?: string | undefined;
    REPORT_SIGNING_SECRET?: string | undefined;
    AUDIT_DAILY_COST_LIMIT?: number | undefined;
    AUDIT_PER_IP_RATE_LIMIT?: number | undefined;
  };
  diagnostics: string[];
} {
  const result = combinedEnvSchema.safeParse(source);
  if (!result.success) {
    const diagnostics = redactedDiagnostics(result.error);
    throw new EnvValidationError(diagnostics);
  }

  return { env: result.data, diagnostics: [] };
}

export class EnvValidationError extends Error {
  public readonly diagnostics: string[];

  constructor(diagnostics: string[]) {
    super(`Environment validation failed: ${diagnostics.join("; ")}`);
    this.name = "EnvValidationError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Convenience that parses the environment from `process.env` and throws on
 * failure. Use this in server entry points and `next.config.ts`.
 */
export function loadEnv(): ReturnType<typeof validateEnv> {
  return validateEnv(process.env);
}

function validateSchema<T>(
  schema: z.ZodType<T>,
  source: Record<string, string | undefined>,
): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(redactedDiagnostics(result.error));
  }
  return result.data;
}

/** Validate the web-process environment subset. */
export function validateWebEnv(source: Record<string, string | undefined>): z.infer<typeof webEnvSchema> {
  return validateSchema(webEnvSchema, source);
}

/** Validate the worker-process environment subset. */
export function validateWorkerEnv(source: Record<string, string | undefined>): z.infer<typeof workerEnvSchema> {
  return validateSchema(workerEnvSchema, source);
}

/** Convenience that loads the web environment from `process.env`. */
export function loadWebEnv(): z.infer<typeof webEnvSchema> {
  return validateWebEnv(process.env);
}

/** Convenience that loads the worker environment from `process.env`. */
export function loadWorkerEnv(): z.infer<typeof workerEnvSchema> {
  return validateWorkerEnv(process.env);
}
