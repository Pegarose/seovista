import { z } from "zod";
import { isValidPublicDomain } from "@seovista/seo-core";

export const AttributionTraceInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3, "Alan adı giriniz.")
    .max(253)
    .refine(isValidPublicDomain, {
      message: "Geçerli bir alan adı giriniz (örn. example.com).",
    }),
  answer: z
    .string()
    .trim()
    .min(40, "Yapıştırılan AI yanıtı en az 40 karakter olmalıdır.")
    .max(8000, "AI yanıtı en fazla 8000 karakter olabilir."),
  keyword: z
    .string()
    .trim()
    .max(120, "Anahtar kelime en fazla 120 karakter olabilir.")
    .optional(),
});

export function validateAttributionTraceInput(input: {
  domain: string;
  answer: string;
  keyword?: string;
}) {
  return AttributionTraceInputSchema.safeParse(input);
}
