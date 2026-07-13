import { z } from "zod";

export const AUDIT_CRAWL_POLICY_LIMITS = [
  "maxRedirects",
  "maxPages",
  "maxResponseBytes",
  "maxDecodedResponseBytes",
  "perPhaseTimeoutMs",
  "totalExecutionTimeMs",
] as const;

const limitBounds = {
  maxRedirects: 20,
  maxPages: 10_000,
  maxResponseBytes: 64 * 1024 * 1024,
  maxDecodedResponseBytes: 128 * 1024 * 1024,
  perPhaseTimeoutMs: 120_000,
  totalExecutionTimeMs: 900_000,
} as const;

function finitePositiveInteger(limit: number) {
  return z
    .number({
      required_error: "limit is required",
      invalid_type_error: "limit must be a finite number",
    })
    .finite("limit must be finite")
    .int("limit must be an integer")
    .positive("limit must be positive")
    .max(limit, `limit must not exceed ${limit}`);
}

export const crawlPolicySchema = z.object({
  maxRedirects: finitePositiveInteger(limitBounds.maxRedirects),
  maxPages: finitePositiveInteger(limitBounds.maxPages),
  maxResponseBytes: finitePositiveInteger(limitBounds.maxResponseBytes),
  maxDecodedResponseBytes: finitePositiveInteger(limitBounds.maxDecodedResponseBytes),
  perPhaseTimeoutMs: finitePositiveInteger(limitBounds.perPhaseTimeoutMs),
  totalExecutionTimeMs: finitePositiveInteger(limitBounds.totalExecutionTimeMs),
}).strict();

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
