import { z } from "zod";
import { isValidPublicDomain } from "@seovista/seo-core";

/**
 * Form-level input validation for the Keyword Rank Checker.
 *
 * This module intentionally has NO "use server" directive: Next.js rejects
 * non-async exports from server-action files, and `validateKeywordRankInput`
 * is a synchronous helper shared between the server action and unit tests.
 *
 * The domain guard delegates to `isValidPublicDomain` from
 * `@seovista/seo-core`, which rejects IP literals, localhost, internal TLDs
 * and dotless hosts before a job is ever created.
 */

export const KeywordRankInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3, "Alan adı giriniz.")
    .max(253)
    .refine(isValidPublicDomain, {
      message: "Geçerli bir alan adı giriniz (örn. example.com).",
    }),
  keyword: z
    .string()
    .trim()
    .min(2, "Anahtar kelime giriniz.")
    .max(120, "Anahtar kelime en fazla 120 karakter olabilir."),
  locale: z.enum(["tr-TR", "en-US"], {
    message: "Geçerli bir bölge seçiniz.",
  }),
});

export function validateKeywordRankInput(input: {
  domain: string;
  keyword: string;
  locale: string;
}) {
  return KeywordRankInputSchema.safeParse(input);
}
