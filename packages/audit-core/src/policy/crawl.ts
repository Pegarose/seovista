import { z } from "zod";

const finitePositive = z
  .number({
    required_error: "limit is required",
    invalid_type_error: "limit must be a finite number",
  })
  .positive("limit must be positive")
  .finite("limit must be finite");

export const crawlPolicySchema = z.object({
  maxRedirects: finitePositive,
  maxPages: finitePositive,
  maxResponseBytes: finitePositive,
  perPhaseTimeoutMs: finitePositive,
  totalExecutionTimeMs: finitePositive,
});

export type CrawlPolicy = z.infer<typeof crawlPolicySchema>;

export function parseCrawlPolicy(input: unknown): CrawlPolicy {
  return crawlPolicySchema.parse(input);
}

export function safeParseCrawlPolicy(input: unknown): {
  success: true;
  data: CrawlPolicy;
} | {
  success: false;
  diagnostics: string[];
} {
  const result = crawlPolicySchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const diagnostics = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, diagnostics };
}
