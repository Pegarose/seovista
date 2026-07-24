import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import nodeConsole from "node:console";
import {
  initSentryOnBoot,
  closeSentry,
  emitAuditSubmitted,
  emitAuditCompleted,
  getSentryMode,
  maskSentryDsn,
  __resetSentryForTests,
} from "../utils/sentry.js";

/**
 * Sentry Instrumentation Bridge tests (Phase A — VAL-A-OBS-001 / VAL-A-OBS-002).
 *
 * Covers the dev / no-DSN path exclusively: the stub sink must log a JSON-
 * encoded payload to stdout for both `audit_submitted` and `audit_completed`,
 * and the boot line must match the contract signature exactly. The real-DSN
 * path is exercised only structurally (init does not throw) — we never let
 * the test reach the network because Sentry no-ops on placeholder DSNs and
 * the stub fallback covers init failures.
 */

describe("sentry instrumentation bridge", () => {
  beforeEach(() => {
    __resetSentryForTests();
    delete process.env.SENTRY_DSN;
  });

  afterEach(async () => {
    await closeSentry();
    __resetSentryForTests();
    vi.restoreAllMocks();
  });

  describe("maskSentryDsn", () => {
    it("redacts the public key while keeping host + project id", () => {
      const masked = maskSentryDsn("https://abc123def@o123.ingest.sentry.io/456");
      expect(masked).toContain("o123.ingest.sentry.io");
      expect(masked).toContain("/456");
      expect(masked).not.toContain("abc123def");
      expect(masked).toContain("****");
    });

    it("returns '****' for a malformed DSN", () => {
      expect(maskSentryDsn("not-a-url")).toBe("****");
    });
  });

  describe("initSentryOnBoot — stub mode (VAL-A-OBS-001)", () => {
    it("logs the exact 'Sentry DSN empty — running with stub sink' line when DSN is unset", async () => {
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);
      const mode = await initSentryOnBoot();
      expect(mode).toBe("stub");
      expect(getSentryMode()).toBe("stub");

      const bootLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes("Sentry DSN empty — running with stub sink"));
      expect(bootLine).toBeDefined();
      // The line is JSON-structured and carries the contract signature verbatim.
      const parsed = JSON.parse(bootLine as string);
      expect(parsed.layer).toBe("sentry");
      expect(parsed.event).toBe("boot_init");
      expect(parsed.mode).toBe("stub");
      expect(parsed.message).toBe("Sentry DSN empty — running with stub sink");
    });

    it("treats a whitespace-only DSN as unset (stub mode)", async () => {
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);
      const mode = await initSentryOnBoot({ SENTRY_DSN: "   " });
      expect(mode).toBe("stub");
      const bootLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes("Sentry DSN empty — running with stub sink"));
      expect(bootLine).toBeDefined();
    });

    it("does not throw on init and stays in stub mode when DSN is empty", async () => {
      await expect(initSentryOnBoot()).resolves.toBe("stub");
      expect(getSentryMode()).toBe("stub");
    });
  });

  describe("initSentryOnBoot — real mode boot log", () => {
    it("logs 'Sentry initialized with DSN: {masked}' with a redacted key when a DSN is present", async () => {
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);
      // Placeholder DSN: Sentry.init accepts it without throwing; no network
      // traffic occurs because the host is non-resolvable / ingest rejects it.
      const dsn = "https://abc123placeholder@o999.ingest.sentry.io/123";
      const mode = await initSentryOnBoot({ SENTRY_DSN: dsn });
      expect(mode).toBe("real");
      expect(getSentryMode()).toBe("real");

      const bootLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes("Sentry initialized with DSN:"));
      expect(bootLine).toBeDefined();
      const parsed = JSON.parse(bootLine as string);
      expect(parsed.message).toContain("Sentry initialized with DSN:");
      expect(parsed.message).not.toContain("abc123placeholder");
      expect(parsed.dsnMasked).toContain("o999.ingest.sentry.io");
      expect(parsed.dsnMasked).not.toContain("abc123placeholder");
    });
  });

  describe("stub sink emits JSON to stdout (VAL-A-OBS-002)", () => {
    it("emitAuditSubmitted writes a JSON payload tagged audit_submitted", async () => {
      await initSentryOnBoot(); // stub mode
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);

      emitAuditSubmitted({
        url: "https://example.com/",
        jobId: "job-123",
        cacheKey: "ck-abc",
        deduped: false,
        forceAudit: false,
      });

      const sinkLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes('"sentry_stub_sink"') && line.includes("audit_submitted"));
      expect(sinkLine).toBeDefined();
      const parsed = JSON.parse(sinkLine as string);
      expect(parsed.layer).toBe("sentry_stub_sink");
      expect(parsed.event).toBe("audit_submitted");
      expect(parsed.url).toBe("https://example.com/");
      expect(parsed.jobId).toBe("job-123");
      expect(parsed.cacheKey).toBe("ck-abc");
      expect(parsed.deduped).toBe(false);
      expect(parsed.forceAudit).toBe(false);
      expect(typeof parsed.timestamp).toBe("string");
    });

    it("emitAuditCompleted writes a JSON payload with all four required fields", async () => {
      await initSentryOnBoot(); // stub mode
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);

      emitAuditCompleted({
        jobId: "job-456",
        url: "https://example.com/",
        score_value: 72,
        per_platform_confidence: {
          chatgpt: 0.8,
          perplexity: 0.75,
          googleAiOverviews: 0.6,
          bingCopilot: 0.7,
        },
        cache_hit: true,
        tier: "good",
      });

      const sinkLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes('"sentry_stub_sink"') && line.includes("audit_completed"));
      expect(sinkLine).toBeDefined();
      const parsed = JSON.parse(sinkLine as string);
      expect(parsed.event).toBe("audit_completed");
      // The four contract-required fields, with correct types:
      expect(typeof parsed.score_value).toBe("number");
      expect(parsed.score_value).toBe(72);
      expect(parsed.per_platform_confidence).toEqual({
        chatgpt: 0.8,
        perplexity: 0.75,
        googleAiOverviews: 0.6,
        bingCopilot: 0.7,
      });
      expect(typeof parsed.cache_hit).toBe("boolean");
      expect(parsed.cache_hit).toBe(true);
      expect(typeof parsed.tier).toBe("string");
      expect(parsed.tier).toBe("good");
    });

    it("emitAuditCompleted fires once per call (no double-emit)", async () => {
      await initSentryOnBoot(); // stub mode
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);

      emitAuditCompleted({
        jobId: "job-once",
        url: "https://example.com/",
        score_value: 50,
        per_platform_confidence: {
          chatgpt: 0.5,
          perplexity: 0.5,
          googleAiOverviews: 0.5,
          bingCopilot: 0.5,
        },
        cache_hit: false,
        tier: "needs_improvement",
      });

      const sinkLines = logSpy.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.includes("audit_completed") && line.includes('"sentry_stub_sink"'));
      expect(sinkLines).toHaveLength(1);
    });
  });

  describe("emit before init", () => {
    it("still routes to the stub sink so dev events are never lost", () => {
      // Do NOT call initSentryOnBoot; mode is 'uninitialized'.
      const logSpy = vi.spyOn(nodeConsole, "log").mockImplementation(() => undefined);

      emitAuditSubmitted({
        url: "https://example.com/",
        jobId: "job-preinit",
        cacheKey: "ck",
        deduped: true,
        forceAudit: false,
      });

      const sinkLine = logSpy.mock.calls
        .map((args) => String(args[0]))
        .find((line) => line.includes("audit_submitted"));
      expect(sinkLine).toBeDefined();
    });
  });
});
