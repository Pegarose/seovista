import { z } from "zod";

/**
 * Form-level input validation for the recurring keyword rank tracker.
 *
 * This module intentionally has NO "use server" directive: Next.js rejects
 * non-async exports from server-action files, and `validateTrackerTargetInput`
 * is a synchronous helper shared between the server action and unit tests.
 */
export const TrackerTargetFormSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta giriniz."),
  keyword: z.string().trim().min(1, "Anahtar kelime gereklidir.").max(200, "Anahtar kelime 200 karakteri geçemez."),
  domain: z.string().trim().min(1, "Alan adı gereklidir.").max(253, "Alan adı 253 karakteri geçemez."),
});

export function validateTrackerTargetInput(input: { email: string; keyword: string; domain: string }) {
  return TrackerTargetFormSchema.safeParse(input);
}
