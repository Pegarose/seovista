import { describe, expect, it } from "vitest";
import {
  crawlPolicySchema,
  parseCrawlPolicy,
  safeParseCrawlPolicy,
} from "../policy/crawl.js";

describe("crawlPolicySchema", () => {
  it("accepts a complete valid policy", () => {
    const policy = crawlPolicySchema.parse({
      maxRedirects: 10,
      maxPages: 100,
      maxResponseBytes: 10_000_000,
      perPhaseTimeoutMs: 30_000,
      totalExecutionTimeMs: 300_000,
    });
    expect(policy.maxPages).toBe(100);
  });

  it("rejects a missing limit", () => {
    expect(() =>
      crawlPolicySchema.parse({
        maxRedirects: 10,
        maxPages: 100,
        maxResponseBytes: 10_000_000,
        perPhaseTimeoutMs: 30_000,
      }),
    ).toThrow();
  });

  it("rejects a non-finite limit", () => {
    expect(() =>
      crawlPolicySchema.parse({
        maxRedirects: 10,
        maxPages: Infinity,
        maxResponseBytes: 10_000_000,
        perPhaseTimeoutMs: 30_000,
        totalExecutionTimeMs: 300_000,
      }),
    ).toThrow();
  });

  it("rejects a negative limit", () => {
    expect(() =>
      crawlPolicySchema.parse({
        maxRedirects: -1,
        maxPages: 100,
        maxResponseBytes: 10_000_000,
        perPhaseTimeoutMs: 30_000,
        totalExecutionTimeMs: 300_000,
      }),
    ).toThrow();
  });

  it("rejects a zero limit", () => {
    expect(() =>
      crawlPolicySchema.parse({
        maxRedirects: 0,
        maxPages: 100,
        maxResponseBytes: 10_000_000,
        perPhaseTimeoutMs: 30_000,
        totalExecutionTimeMs: 300_000,
      }),
    ).toThrow();
  });

  it("rejects a non-numeric limit", () => {
    expect(() =>
      crawlPolicySchema.parse({
        maxRedirects: "10",
        maxPages: 100,
        maxResponseBytes: 10_000_000,
        perPhaseTimeoutMs: 30_000,
        totalExecutionTimeMs: 300_000,
      }),
    ).toThrow();
  });
});

describe("parseCrawlPolicy", () => {
  it("parses a valid policy", () => {
    const policy = parseCrawlPolicy({
      maxRedirects: 5,
      maxPages: 50,
      maxResponseBytes: 1_000_000,
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
