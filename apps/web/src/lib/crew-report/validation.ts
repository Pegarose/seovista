import { z } from "zod";

/**
 * Form-level input validation for the email-gated crew report section.
 *
 * This module intentionally has NO "use server" directive: Next.js rejects
 * non-async exports from server-action files, and `validateCrewReportInput`
 * is a synchronous helper shared between the server action and unit tests.
 *
 * The tool union mirrors `CREW_REPORT_TOOLS` from the worker processor
 * (`apps/worker/src/processors/crew-report.ts`); it is duplicated here as a
 * plain Zod enum because server-action validation modules cannot import
 * worker value exports without pulling the worker into the client graph.
 */
export const CREW_REPORT_TOOL_VALUES = [
  "geo-readiness",
  "schema",
  "ai-crawler",
  "keyword-rank",
] as const;

export const CrewReportFormSchema = z.object({
  sourceJobId: z.string().uuid("Geçersiz işlem kimliği."),
  tool: z.enum(CREW_REPORT_TOOL_VALUES, {
    message: "Geçersiz araç değeri.",
  }),
  email: z.string().trim().email("Geçerli bir e-posta giriniz."),
  consent: z.literal(true, {
    // errorMap (not `message`) so the Turkish consent error is returned for
    // every failure mode — `message` only covers the required/undefined path
    // for z.literal and leaves the invalid-literal path in English.
    errorMap: () => ({ message: "Devam etmek için onay gereklidir." }),
  }),
});

export function validateCrewReportInput(input: {
  sourceJobId: string;
  tool: string;
  email: string;
  consent: boolean;
}) {
  return CrewReportFormSchema.safeParse(input);
}
