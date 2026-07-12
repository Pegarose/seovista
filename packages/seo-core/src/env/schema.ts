import { z } from "zod";

/**
 * Treat empty strings as absent values so optional environment variables can be
 * left blank in `.env` files without failing validation.
 */
function emptyToUndefined<T>(schema: z.ZodType<T>): z.ZodType<T | undefined> {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  ) as z.ZodType<T | undefined>;
}

const optionalString = emptyToUndefined(z.string());
const optionalUrl = emptyToUndefined(z.string().url());
const optionalEmail = emptyToUndefined(z.string().email());
const optionalNonNegativeFinite = emptyToUndefined(
  z.coerce.number().nonnegative("must be a non-negative finite number").finite(),
);
const optionalPositiveFinite = emptyToUndefined(
  z.coerce.number().positive("must be a positive finite number").finite(),
);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url("NEXT_PUBLIC_SITE_URL must be a valid URL"),
  NEXT_PUBLIC_ANALYTICS_ID: optionalString,
});

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z
    .string()
    .startsWith("redis://", "REDIS_URL must start with redis://")
    .min(1, "REDIS_URL is required"),
  NEXTG_API_URL: z.string().url("NEXTG_API_URL must be a valid URL"),
  NEXTG_API_TOKEN: optionalString,
  DATAFORSEO_API_KEY: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,
  OBJECT_STORAGE_ENDPOINT: optionalUrl,
  OBJECT_STORAGE_BUCKET: optionalString,
  OBJECT_STORAGE_ACCESS_KEY: optionalString,
  OBJECT_STORAGE_SECRET_KEY: optionalString,
  EMAIL_PROVIDER_API_KEY: optionalString,
  EMAIL_FROM: optionalEmail,
  SENTRY_DSN: optionalUrl,
  REPORT_SIGNING_SECRET: optionalString,
  AUDIT_DAILY_COST_LIMIT: optionalNonNegativeFinite,
  AUDIT_PER_IP_RATE_LIMIT: optionalPositiveFinite,
});

export const combinedEnvSchema = publicEnvSchema.merge(serverEnvSchema);

/**
 * Environment subset consumed by the web process. Does not require worker-only
 * connection strings, so mock/unconfigured builds succeed without real
 * provider credentials.
 */
export const webEnvSchema = publicEnvSchema.merge(
  serverEnvSchema.pick({
    NEXTG_API_URL: true,
    NEXTG_API_TOKEN: true,
    GOOGLE_CLIENT_ID: true,
    GOOGLE_CLIENT_SECRET: true,
    GOOGLE_REDIRECT_URI: true,
    SENTRY_DSN: true,
  }),
);

/**
 * Environment subset consumed by the worker process.
 */
export const workerEnvSchema = serverEnvSchema;
