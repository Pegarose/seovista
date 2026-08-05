import { z } from "zod";

/**
 * Form-level input validation for the Schema Truth Check.
 *
 * Schema truth check is a URL audit (not a bare domain), because JSON-LD
 * claims are page-scoped. This module intentionally has NO "use server"
 * directive: Next.js rejects non-async exports from server-action files, and
 * `validateSchemaTruthInput` is a synchronous helper shared between the
 * server action and unit tests.
 */

export const SchemaTruthInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Geçerli bir URL giriniz (örn. https://example.com/page).")
    .refine(
      (val) => {
        try {
          const hostname = new URL(val).hostname.toLowerCase();
          if (["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) return false;
          if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("172.16.")) return false;
          if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".corp")) return false;
          return true;
        } catch {
          return false;
        }
      },
      { message: "İç ağ / yerel hedefler denetlenemez." },
    ),
});

export function validateSchemaTruthInput(input: { url: string }) {
  return SchemaTruthInputSchema.safeParse(input);
}
