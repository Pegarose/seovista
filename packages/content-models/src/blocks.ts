import { z } from "zod";

export const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  text: z.string().trim(),
});

export const HeadingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.enum(["h2", "h3", "h4"]),
  text: z.string().trim().min(1),
});

export const CtaBlockSchema = z.object({
  type: z.literal("cta"),
  label: z.string().min(1),
  url: z.string().url().or(z.string().startsWith("/")),
});

export const EditorBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  CtaBlockSchema,
]);

export type EditorBlock = z.infer<typeof EditorBlockSchema>;
