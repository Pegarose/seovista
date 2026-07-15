import { publicEnvSchema } from "./schema.js";

export type { PublicEnv } from "./types.js";

/**
 * Parse the browser-exposable environment subset.
 * Use only inside client-safe code or shared constants that rely on
 * `NEXT_PUBLIC_*` variables.
 */
export function parsePublicEnv(source: Record<string, string | undefined>): {
  NEXT_PUBLIC_SITE_URL: string;
  NEXT_PUBLIC_ANALYTICS_ID?: string | undefined;
} {
  return publicEnvSchema.parse(source);
}

export { publicEnvSchema };
