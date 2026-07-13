/**
 * SeoVista JSON Codec
 *
 * Adapted from every-app/open-seo (v0.0.25, MIT)
 * Upstream: src/shared/json.ts
 * Commit: 3f2b4872caef809f0280a765f9eb469e8a6b523a
 *
 * Zod codec for safe JSON serialization/deserialization with schema
 * validation at parse boundaries. Used by content-models and DataForSEO
 * normalization layers.
 *
 * @owner SeoVista Foundation Team
 * @review Accepted — Sprint 0 adaptation boundary
 */

import { z } from 'zod';

/**
 * Branded type for JSON codecs to prevent accidental mixing of codecs
 * for different schemas.
 */
export type SeovistaJsonCodec<T> = z.ZodEffects<z.ZodString, T, string> & {
  _brand: 'SeovistaJsonCodec';
};

/**
 * Creates a Zod codec that safely parses a JSON string and validates
 * the resulting value against the provided schema.
 *
 * @param schema - The Zod schema to validate parsed JSON against
 * @param parseErrorMessage - Custom message for JSON parse failures
 * @param schemaErrorMessage - Custom message for schema validation failures
 */
export function createSeovistaJsonCodec<T>(
  schema: z.ZodType<T>,
  parseErrorMessage = 'Invalid JSON',
  schemaErrorMessage = 'JSON does not match schema',
): SeovistaJsonCodec<T> {
  return z
    .string()
    .transform((jsonString, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString) as unknown;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: parseErrorMessage,
        });
        return z.NEVER;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: schemaErrorMessage,
        });
        return z.NEVER;
      }

      return validated.data;
    }) as unknown as SeovistaJsonCodec<T>;
}
