import { describe, expect, it } from "vitest";
import {
  AUDIT_CRAWL_POLICY_LIMITS,
  crawlPolicySchema,
  parseCrawlPolicy,
  safeParseCrawlPolicy,
} from "../policy/crawl.js";

const validPolicy = {
  maxRedirects: 10,
  maxPages: 100,
  maxResponseBytes: 10_000_000,
  maxDecodedResponseBytes: 10_000_000,
  perPhaseTimeoutMs: 30_000,
  totalExecutionTimeMs: 300_000,
};

describe("crawlPolicySchema", () => {
  it("accepts a complete valid policy", () => {
    const policy = crawlPolicySchema.parse(validPolicy);
    expect(policy.maxPages).toBe(100);
    expect(policy.maxDecodedResponseBytes).toBe(10_000_000);
  });

  it("requires every declared audit-crawl limit", () => {
    expect(AUDIT_CRAWL_POLICY_LIMITS).toEqual([
      "maxRedirects",
      "maxPages",
      "maxResponseBytes",
      "maxDecodedResponseBytes",
      "perPhaseTimeoutMs",
      "totalExecutionTimeMs",
    ]);

    for (const limit of AUDIT_CRAWL_POLICY_LIMITS) {
      const incompletePolicy: Record<string, unknown> = { ...validPolicy };
      delete incompletePolicy[limit];
      expect(crawlPolicySchema.safeParse(incompletePolicy).success).toBe(false);
    }
  });

  it("rejects non-finite, negative, zero, and out-of-range limits", () => {
    for (const invalidValue of [Infinity, -1, 0, "10", 10.5] as const) {
      expect(
        crawlPolicySchema.safeParse({
          ...validPolicy,
          maxRedirects: invalidValue,
        }).success,
      ).toBe(false);
    }

    expect(
      crawlPolicySchema.safeParse({
        ...validPolicy,
        maxPages: 10_001,
      }).success,
    ).toBe(false);
    expect(
      crawlPolicySchema.safeParse({
        ...validPolicy,
        maxResponseBytes: 67_108_865,
      }).success,
    ).toBe(false);
    expect(
      crawlPolicySchema.safeParse({
        ...validPolicy,
        maxDecodedResponseBytes: 134_217_729,
      }).success,
    ).toBe(false);
    expect(
      crawlPolicySchema.safeParse({
        ...validPolicy,
        perPhaseTimeoutMs: 120_001,
      }).success,
    ).toBe(false);
    expect(
      crawlPolicySchema.safeParse({
        ...validPolicy,
        totalExecutionTimeMs: 900_001,
      }).success,
    ).toBe(false);
  });
});

describe("parseCrawlPolicy", () => {
  it("parses a valid policy", () => {
    const policy = parseCrawlPolicy({
      maxRedirects: 5,
      maxPages: 50,
      maxResponseBytes: 1_000_000,
      maxDecodedResponseBytes: 2_000_000,
      perPhaseTimeoutMs: 10_000,
      totalExecutionTimeMs: 60_000,
    });
    expect(policy.maxPages).toBe(50);
  });
});

describe("safeParseCrawlPolicy", () => {
  it("returns diagnostics for an invalid policy", () => {
    const result = safeParseCrawlPolicy({
      maxRedirects: -1,
      maxPages: 0,
      maxResponseBytes: Infinity,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some((d) => d.includes("maxRedirects"))).toBe(true);
    }
  });
});
