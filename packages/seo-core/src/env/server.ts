import "server-only";

import { serverEnvSchema } from "./schema.js";

export type { ServerEnv } from "./types.js";

/**
 * Parse the server-only environment subset.
 * Importing this module from client code is a static error because of the
 * `server-only` marker.
 */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): {
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
} {
  return serverEnvSchema.parse(source);
}

export { serverEnvSchema };
