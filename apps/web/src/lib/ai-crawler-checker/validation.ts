import { z } from "zod";
import { isSafePublicHttpUrl } from "../url-safety";

/**
 * Form-level input validation for the AI Crawler Checker.
 *
 * This module intentionally has NO "use server" directive: Next.js rejects
 * non-async exports from server-action files, and `validateAiCrawlerInput` is
 * a synchronous helper shared between the server action and unit tests.
 *
 * SSRF note: the guard lives in the shared `../url-safety` module; it is a
 * defense-in-depth form guard only. The authoritative SSRF boundary is the
 * worker fetcher (`apps/worker/src/utils/fetcher.ts`).
 */

export const AiCrawlerInputSchema = z.object({
  url: z
    .string()
    .url("Geçerli bir URL giriniz.")
    .min(1, "URL alanının doldurulması zorunludur.")
    .refine(isSafePublicHttpUrl, "Bu adrese erişim güvenlik nedeniyle engellendi."),
});

export function validateAiCrawlerInput(url: string) {
  return AiCrawlerInputSchema.safeParse({ url });
}
