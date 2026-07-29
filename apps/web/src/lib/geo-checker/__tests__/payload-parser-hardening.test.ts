import { describe, it, expect } from "vitest";

/**
 * RED tests for contract hardening payload parser requirements.
 * These test strict validation of bounds, types, target URLs, and preview provenance.
 */

// Import functions from page or helper module to be hardened/tested
import {
  parseCompletedPayload,
  validatePreviewProvenance,
  validateMatchedServiceTags,
} from "../../../lib/geo-checker/payload-parser";

function canonicalModules() {
  return [
    { key: "indexability_crawlability", name: "Indexability & Crawlability", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "technical_seo_metadata", name: "Technical SEO Metadata", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "content_quality_intent", name: "Content Quality & Intent", score: 20, maxScore: 20, status: "excellent", issues: [] },
    { key: "semantic_coverage", name: "Semantic Coverage", score: 15, maxScore: 15, status: "excellent", issues: [] },
    { key: "page_experience_performance", name: "Page Experience & Performance", score: 10, maxScore: 10, status: "excellent", issues: [] },
    { key: "internal_linking_architecture", name: "Internal Linking Architecture", score: 10, maxScore: 10, status: "excellent", issues: [] },
    { key: "ai_visibility_readiness", name: "AI Visibility & Readiness", score: 5, maxScore: 5, status: "excellent", issues: [] },
  ];
}

describe("GEO Payload Parser & Contract Hardening (RED Stage)", () => {
  describe("Finite scores and contract bounds", () => {
    it("rejects non-finite overall score (NaN, Infinity, -Infinity)", () => {
      expect(parseCompletedPayload({ breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: NaN, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: Infinity, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: -Infinity, band: "good", modules: [] } })).toBeNull();
    });

    it("rejects non-finite module score or maxScore", () => {
      const payloadBadScore = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 50,
          band: "good",
          modules: [{ key: "m1", name: "M1", score: NaN, maxScore: 100, status: "good", issues: [] }],
        },
      };
      expect(parseCompletedPayload(payloadBadScore)).toBeNull();

      const payloadBadMaxScore = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 50,
          band: "good",
          modules: [{ key: "m1", name: "M1", score: 50, maxScore: Infinity, status: "good", issues: [] }],
        },
      };
      expect(parseCompletedPayload(payloadBadMaxScore)).toBeNull();
    });

    it("rejects unknown module status without coercion", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 50,
          band: "good",
          modules: [{ key: "m1", name: "M1", score: 50, maxScore: 100, status: "super_good", issues: [] }],
        },
      };
      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects unknown issue severity without coercion", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 50,
          band: "good",
          modules: [
            {
              key: "m1",
              name: "M1",
              score: 50,
              maxScore: 100,
              status: "good",
              issues: [{ code: "I1", message: "msg", pointLoss: -5, severity: "ultra_critical", module: "m1" }],
            },
          ],
        },
      };
      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects non-finite pointLoss in issues", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 50,
          band: "good",
          modules: [
            {
              key: "m1",
              name: "M1",
              score: 50,
              maxScore: 100,
              status: "good",
              issues: [{ code: "I1", message: "msg", pointLoss: NaN, severity: "critical", module: "m1" }],
            },
          ],
        },
      };
      expect(parseCompletedPayload(payload)).toBeNull();
    });
  });

  describe("HTTP(S) Target URL Validation", () => {
    it("accepts valid HTTP/HTTPS target URLs", () => {
      expect(parseCompletedPayload({ target: "https://example.com", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: canonicalModules() } })?.targetUrl).toBe("https://example.com");
      expect(parseCompletedPayload({ target: "http://example.com/path", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: canonicalModules() } })?.targetUrl).toBe("http://example.com/path");
    });

    it("rejects non-HTTP(S) target URLs (ftp, javascript, file, data)", () => {
      expect(parseCompletedPayload({ target: "ftp://example.com", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ target: "javascript:alert(1)", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ target: "file:///etc/passwd", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ target: "data:text/html,test", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
    });

    it("rejects relative or malformed target URLs", () => {
      expect(parseCompletedPayload({ target: "/relative/path", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
      expect(parseCompletedPayload({ target: "not a url", breakdown: { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: [] } })).toBeNull();
    });

    it("rejects target and preview URLs that contain userinfo", () => {
      const breakdown = { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: canonicalModules() };
      expect(parseCompletedPayload({ target: "https://user@example.com", breakdown })).toBeNull();
      expect(validatePreviewProvenance({
        title: "Title",
        snippet: "Snippet",
        url: "https://user@example.com",
      })).toBeNull();
    });

    it("rejects a completed payload when target provenance is absent or invalid", () => {
      const breakdown = { scoreVersion: "seovista-score-v1.2-decoupled", overallScore: 80, band: "good", modules: canonicalModules() };
      expect(parseCompletedPayload({ breakdown })).toBeNull();
      expect(parseCompletedPayload({ target: "ftp://example.com", breakdown })).toBeNull();
    });
  });

  describe("Platform Readiness Numeric & Range Validation", () => {
    it("validates platform score range 0-100 and confidence range 0-1", () => {
      const payload = {
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: [
            { platform: "google", score: 85, confidence: 0.9, rationale: "good", experimental: false },
            { platform: "chatgpt", score: 150, confidence: 0.5 }, // score > 100 out of range
            { platform: "bing", score: 50, confidence: 1.5 }, // confidence > 1 out of range
            { platform: "claude", score: -10, confidence: 0.5 }, // score < 0 out of range
            { platform: "perplexity", score: 50, confidence: -0.1 }, // confidence < 0 out of range
            { platform: "gemini", score: NaN, confidence: 0.5 }, // non-finite
          ],
        },
      };

      const res = parseCompletedPayload(payload);
      expect(res?.breakdown?.platformReadiness).toHaveLength(1);
      expect(res?.breakdown?.platformReadiness?.[0]?.platform).toBe("google");
    });
  });

  describe("Matched Services & IssueTag Vocabulary Guard", () => {
    it("narrows matched service tags against IssueTag vocabulary strictly", () => {
      const services = [
        {
          service_id: "s1",
          name: "S1",
          description: "D1",
          matchedTags: ["technical-seo", "content-depth", "INVALID_VOCAB_TAG", 123, null],
          relevanceScore: 80,
          addressedIssueCodes: ["C001"],
        },
      ];

      const res = validateMatchedServiceTags(services);
      expect(res).toHaveLength(1);
      expect(res?.[0]?.matchedTags).toEqual(["technical-seo", "content-depth"]);
    });

    it("omits optional non-boolean experimental values instead of coercing them", () => {
      const payload = {
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: [
            { platform: "google", score: 85, confidence: 0.9, experimental: "false" },
            { platform: "chatgpt", score: 70, confidence: 0.8, rationale: "Stable readiness projection", experimental: false },
          ],
        },
      };

      expect(parseCompletedPayload(payload)?.breakdown?.platformReadiness).toEqual([
        { platform: "chatgpt", score: 70, confidence: 0.8, rationale: "Stable readiness projection", experimental: false },
      ]);
    });

    it("validates relevance score range 0-100 and finite check", () => {
      const services = [
        { service_id: "s1", name: "S1", description: "D1", matchedTags: [], relevanceScore: 80, addressedIssueCodes: [] },
        { service_id: "s2", name: "S2", description: "D2", matchedTags: [], relevanceScore: 150, addressedIssueCodes: [] }, // out of range
        { service_id: "s3", name: "S3", description: "D3", matchedTags: [], relevanceScore: NaN, addressedIssueCodes: [] }, // non-finite
      ];

      const res = validateMatchedServiceTags(services);
      expect(res).toHaveLength(1);
      expect(res?.[0]?.service_id).toBe("s1");
    });

    it("omits a service with malformed addressed issue codes rather than filtering claims", () => {
      const result = validateMatchedServiceTags([
        {
          service_id: "s1",
          name: "S1",
          description: "D1",
          matchedTags: [],
          relevanceScore: 80,
          addressedIssueCodes: ["C001", 42],
        },
      ]);

      expect(result).toBeUndefined();
    });
  });

  describe("Engine module bounds and required nested fields", () => {
    it("rejects a completed breakdown that omits a canonical engine module", () => {
      const payload = {
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: [
            { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good", issues: [] },
          ],
        },
      };

      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects a known module with a fabricated maxScore", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: [
            {
              key: "content_quality_intent",
              name: "Content Quality & Intent",
              score: 10,
              maxScore: 999,
              status: "good",
              issues: [],
            },
          ],
        },
      };

      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects an unknown module key rather than accepting an unbounded projection", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: [{ key: "mystery_module", name: "Mystery", score: 10, maxScore: 10, status: "good", issues: [] }],
        },
      };

      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects an issue whose module identity does not match its containing module", () => {
      const payload = {
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: [
            {
              key: "content_quality_intent",
              name: "Content Quality & Intent",
              score: 10,
              maxScore: 20,
              status: "good",
              issues: [{ code: "I1", message: "Issue", pointLoss: -1, severity: "low", module: "other_module" }],
            },
          ],
        },
      };

      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("rejects duplicate persisted module keys", () => {
      const payload = {
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: [
            { key: "content_quality_intent", name: "Content Quality & Intent", score: 10, maxScore: 20, status: "good", issues: [] },
            { key: "content_quality_intent", name: "Duplicate Content Quality", score: 12, maxScore: 20, status: "good", issues: [] },
          ],
        },
      };

      expect(parseCompletedPayload(payload)).toBeNull();
    });

    it("omits a platform projection when required boolean provenance is absent", () => {
      const payload = {
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: [
            { platform: "google", score: 85, confidence: 0.9, rationale: "Stable readiness" },
          ],
        },
      };

      expect(parseCompletedPayload(payload)?.breakdown?.platformReadiness).toBeUndefined();
    });

    it("omits a matched service without complete persisted arrays", () => {
      expect(validateMatchedServiceTags([
        { service_id: "svc-1", name: "Service", description: "Description", relevanceScore: 80 },
      ])).toBeUndefined();
    });

    it("omits a malformed platform projection when every entry is invalid", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: [
            { platform: "google", score: 101, confidence: 0.5, rationale: "invalid", experimental: false },
          ],
        },
      });

      expect(parsed?.breakdown?.platformReadiness).toBeUndefined();
    });

    it("omits a malformed non-array platform projection", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: { platform: "google", score: 80 },
        },
      });

      expect(parsed?.breakdown?.platformReadiness).toBeUndefined();
    });

    it("preserves an explicitly persisted empty platform projection", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
          platformReadiness: [],
        },
      });

      expect(parsed?.breakdown?.platformReadiness).toEqual([]);
    });
  });

  describe("Preview Provenance Validation", () => {
    it("requires each preview to have its own valid title, snippet, and HTTP(S) URL", () => {
      const serpPreview = {
        title: "Valid SERP Title",
        snippet: "Valid SERP Snippet",
        url: "https://example.com",
        sourceMode: "simulated",
        displayType: "serp",
        provider: "deterministic-fixture",
        fixtureId: "preview-fixture-1",
        requestId: "request-1",
        operationKey: "https://example.com",
        runId: "run-1",
        capturedAt: "2026-07-29T00:00:00.000Z",
        ttlSeconds: 3600,
        freshness: "fresh",
        outcome: "success",
      };
      expect(validatePreviewProvenance(serpPreview)).toEqual(serpPreview);
    });

    it("rejects preview when URL is missing or non-HTTP(S) or inherited/synthesized", () => {
      expect(validatePreviewProvenance({ title: "T", snippet: "S", url: "ftp://example.com" })).toBeNull();
      expect(validatePreviewProvenance({ title: "T", snippet: "S", url: "javascript:alert(1)" })).toBeNull();
      expect(validatePreviewProvenance({ title: "T", snippet: "S", url: "" })).toBeNull();
      expect(validatePreviewProvenance({ title: "T", snippet: "S" })).toBeNull(); // missing url
    });

    it("rejects preview when title or snippet is empty or missing", () => {
      expect(validatePreviewProvenance({ title: "", snippet: "Snippet", url: "https://example.com" })).toBeNull();
      expect(validatePreviewProvenance({ title: "Title", snippet: "", url: "https://example.com" })).toBeNull();
      expect(validatePreviewProvenance({ title: null, snippet: "Snippet", url: "https://example.com" })).toBeNull();
    });

    it("requires persisted source and freshness provenance for every preview", () => {
      expect(validatePreviewProvenance({
        title: "Title",
        snippet: "Snippet",
        url: "https://example.com",
        sourceMode: "simulated",
        displayType: "serp",
        provider: "deterministic-fixture",
        fixtureId: "preview-fixture-1",
        requestId: "request-1",
        operationKey: "https://example.com",
        runId: "run-1",
        capturedAt: "2026-07-29T00:00:00.000Z",
        ttlSeconds: 3600,
        freshness: "fresh",
        outcome: "success",
      })).toMatchObject({
        sourceMode: "simulated",
        displayType: "serp",
        provider: "deterministic-fixture",
        fixtureId: "preview-fixture-1",
        requestId: "request-1",
        operationKey: "https://example.com",
        runId: "run-1",
        capturedAt: "2026-07-29T00:00:00.000Z",
        ttlSeconds: 3600,
        freshness: "fresh",
        outcome: "success",
      });
    });

    it("omits a preview that lacks persisted provenance instead of rendering a claim", () => {
      expect(validatePreviewProvenance({
        title: "Title",
        snippet: "Snippet",
        url: "https://example.com",
      })).toBeNull();
    });

    it("accepts a preview with independent persisted source URL provenance", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
        },
        serpPreview: {
          title: "Independent title",
          snippet: "Independent snippet",
          url: "https://other.example/result",
          sourceMode: "simulated",
          displayType: "serp",
          provider: "fixture-provider",
          fixtureId: "fixture-1",
          requestId: "request-1",
          operationKey: "operation-1",
          runId: "run-1",
          capturedAt: "2026-07-29T00:00:00.000Z",
          ttlSeconds: 3600,
          freshness: "fresh",
          outcome: "success",
        },
      });

      expect(parsed?.serpPreview?.url).toBe("https://other.example/result");
    });

    it("rejects previews stored in the wrong preview slot", () => {
      const preview = {
        title: "Independent title",
        snippet: "Independent snippet",
        url: "https://example.com",
        sourceMode: "simulated",
        provider: "fixture-provider",
        fixtureId: "fixture-1",
        requestId: "request-1",
        operationKey: "https://example.com",
        runId: "run-1",
        capturedAt: "2026-07-29T00:00:00.000Z",
        ttlSeconds: 3600,
        freshness: "fresh",
        outcome: "success",
      };

      expect(parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
        },
        serpPreview: { ...preview, displayType: "ai" },
        aiPreview: { ...preview, displayType: "serp" },
      })).toMatchObject({ serpPreview: null, aiPreview: null });
    });

    it.each(["no_results", "expired", "unavailable", "revoked"] as const)(
      "preserves persisted %s freshness without treating it as fresh success",
      (freshness) => {
        const parsed = validatePreviewProvenance({
          title: "Title",
          snippet: "Snippet",
          url: "https://example.com",
          sourceMode: "live",
          displayType: "serp",
          provider: "fixture-provider",
          fixtureId: "fixture-1",
          requestId: "request-1",
          operationKey: "https://example.com",
          runId: "run-1",
          capturedAt: "2026-07-29T00:00:00.000Z",
          ttlSeconds: 3600,
          freshness,
          outcome: "partial",
        });

        expect(parsed?.freshness).toBe(freshness);
        expect(parsed?.outcome).toBe("partial");
      },
    );
  });

  describe("Score version and degraded marker", () => {
    it("rejects a present malformed degraded marker instead of treating it as absent", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          degraded: "false",
          modules: canonicalModules(),
        },
      });

      expect(parsed).toBeNull();
    });

    it("keeps absent, explicitly empty, and malformed matched-services projections distinct", () => {
      const breakdown = {
        scoreVersion: "seovista-score-v1.2-decoupled",
        overallScore: 80,
        band: "good",
        modules: canonicalModules(),
      };

      const absent = parseCompletedPayload({ target: "https://example.com", breakdown });
      const explicitlyEmpty = parseCompletedPayload({
        target: "https://example.com",
        breakdown,
        matchedServices: [],
      });
      const malformed = parseCompletedPayload({
        target: "https://example.com",
        breakdown,
        matchedServices: { service_id: "not-an-array" },
      });

      expect(absent?.matchedServices).toBeUndefined();
      expect(explicitlyEmpty?.matchedServices).toEqual([]);
      expect(malformed?.matchedServices).toBeUndefined();
    });

    it("omits a present matched-services array when every row is malformed", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
        },
        matchedServices: [
          {
            service_id: "svc-invalid",
            name: "",
            description: "",
            matchedTags: ["not-a-contract-tag"],
            relevanceScore: 101,
            addressedIssueCodes: [],
          },
        ],
      });

      expect(parsed?.matchedServices).toBeUndefined();
    });

    it("rejects an unsupported score version", () => {
      expect(parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "untrusted-formula-v99",
          overallScore: 80,
          band: "good",
          modules: canonicalModules(),
        },
      })).toBeNull();
    });

    it("preserves the persisted degraded marker", () => {
      const parsed = parseCompletedPayload({
        target: "https://example.com",
        breakdown: {
          scoreVersion: "seovista-score-v1.2-decoupled",
          overallScore: 80,
          band: "good",
          degraded: true,
          modules: canonicalModules(),
        },
      });

      expect(parsed?.breakdown?.degraded).toBe(true);
    });
  });
});
