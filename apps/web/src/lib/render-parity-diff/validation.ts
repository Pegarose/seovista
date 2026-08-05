import { z } from "zod";

export const RenderParityInputSchema = z.object({
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

export function validateRenderParityInput(input: { url: string }) {
  return RenderParityInputSchema.safeParse(input);
}
