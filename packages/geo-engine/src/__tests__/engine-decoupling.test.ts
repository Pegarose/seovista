import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { ScoringEngine, SCORE_VERSION } from "../engine.js";
import { nwClient } from "../providers/neuronwriter.js";
import type { NWEnrichmentResult } from "../providers/neuronwriter.js";
import type { ScoreContext, ParsedPage } from "../types.js";

/**
 * Trust-foundation decoupling tests.
 *
 * These specs lock in the three VAL-A-TRUST-* assertions for the
 * `scoring-trust-decoupling` feature:
 *   - TRUST-001: identical ParsedPage => byte-identical 0-100 score across N>=5
 *     runs, regardless of NeuronWriter enrichment state.
 *   - TRUST-002: when the NeuronWriter enrichment layer errors out, the engine
 *     still returns a valid [0,100] score; only the recommendation list loses
 *     NeuronWriter-derived items and gains a documented fallback marker.
 *   - TRUST-003: `ScoreOutput.overall.score_version` is a non-empty string
 *     constant operators can compare across runs.
 */

function buildParsedPage(): ParsedPage {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html" },
    title: "Semantic SEO Guide",
    metaDescription: "A practical guide to semantic SEO.",
    canonical: "https://example.com/semantic-seo",
    metaRobots: { noindex: false, nofollow: false },
    headings: [
      { level: 1, text: "Semantic SEO Guide" },
      { level: 2, text: "Introduction" },
      { level: 2, text: "Topic Clusters" },
    ],
    links: [
      { href: "https://example.com/about", text: "About", isInternal: true },
    ],
    images: [{ src: "https://example.com/og.png", alt: "Semantic SEO" }],
    jsonLd: [
      {
        "@type": "Article",
        headline: "Semantic SEO Guide",
        author: { "@type": "Organization", name: "Example" },
      },
    ],
    og: { title: "Semantic SEO Guide" },
    rawHtml:
      "<html><body><h1>Semantic SEO Guide</h1><p>Introduction to semantic seo and topic clusters.</p></body></html>",
    textContent:
      "Semantic SEO Guide Introduction to semantic seo and topic clusters. Entity coverage and NLP optimization matter.",
  };
}

function buildContext(opts: {
  includeNeuronWriter: boolean;
  targetKeyword?: string;
}): ScoreContext {
  return {
    tenantId: "test-tenant",
    url: "https://example.com/semantic-seo",
    normalizedUrl: "https://example.com/semantic-seo",
    targetKeyword: opts.targetKeyword ?? "semantic seo",
    platform: "custom",
    parsed: buildParsedPage(),
    options: {
      includeNeuronWriter: opts.includeNeuronWriter,
      includePerformance: false,
      includeAiVisibility: true,
      renderJavascript: false,
      storeSnapshot: false,
    },
  };
}

describe("ScoringEngine trust decoupling — VAL-A-TRUST-001 (determinism)", () => {
  const originalEnv = process.env.NEURONWRITER_API_KEY;
  const originalAdapter = nwClient.defaults.adapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEURONWRITER_API_KEY = "test_nw_key";
  });

  afterEach(() => {
    process.env.NEURONWRITER_API_KEY = originalEnv;
    nwClient.defaults.adapter = originalAdapter as NonNullable<
      typeof nwClient.defaults.adapter
    >;
  });

  it("produces byte-identical overall score across 5 runs with enrichment disabled (offline)", async () => {
    const engine = new ScoringEngine();
    const context = buildContext({ includeNeuronWriter: false });

    const scores: number[] = [];
    for (let i = 0; i < 5; i++) {
      const out = await engine.scorePage(context, Date.now());
      scores.push(out.overall.score);
    }

    const first = scores[0];
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(100);
    expect(scores.every((s) => s === first)).toBe(true);
  });

  it("produces identical overall score regardless of varying NeuronWriter enrichment state", async () => {
    // Alternate the NeuronWriter adapter between a ready enrichment and an
    // error path across runs. The score must stay identical because
    // enrichment no longer enters the score path.
    const readyResponse: NWEnrichmentResult = {
      provider: "neuronwriter",
      status: "ready",
      terms: {
        content_basic: [{ t: "zeta term", usage_pc: 80 }],
        content_extended: [{ t: "omega term", usage_pc: 60 }],
        h2: [{ t: "lsi keywords" }],
        entities: [{ t: "Zeta Entity" }],
      },
      ideas: { suggest_questions: [{ q: "What is zeta?" }] },
      recommendedHeadings: ["lsi keywords", "What is zeta?"],
      missingLsiTerms: ["zeta term", "omega term"],
    };

    let call = 0;
    nwClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const urlString =
        typeof config.url === "string" ? config.url : String(config.url);
      if (urlString.includes("/new-query")) {
        return { data: { query: "q" + call }, status: 200, statusText: "OK", headers: {}, config };
      }
      if (urlString.includes("/get-query")) {
        // Even runs: ready enrichment. Odd runs: simulate a 500 (error path).
        if (call % 2 === 0) {
          call++;
          return { data: { ...readyResponse }, status: 200, statusText: "OK", headers: {}, config };
        }
        call++;
        throw new Error("Simulated NeuronWriter 500");
      }
      throw new Error(`Unexpected axios call: ${urlString}`);
    };

    const engine = new ScoringEngine();
    const context = buildContext({ includeNeuronWriter: true });

    const outputs: { score: number; version: string; hasLsi: boolean; hasFallback: boolean }[] = [];
    for (let i = 0; i < 6; i++) {
      const out = await engine.scorePage(context, Date.now());
      outputs.push({
        score: out.overall.score,
        version: out.overall.score_version,
        hasLsi: out.enrichmentIssues.some((x) => x.code === "SEMANTIC_LSI_GAP"),
        hasFallback: out.enrichmentIssues.some(
          (x) => x.code === "SEMANTIC_ENRICHMENT_UNAVAILABLE"
        ),
      });
    }

    const firstScore = outputs[0]?.score;
    expect(firstScore).toBeDefined();
    expect(firstScore!).toBeGreaterThanOrEqual(0);
    expect(firstScore!).toBeLessThanOrEqual(100);
    // Score identical across all runs regardless of enrichment state.
    expect(outputs.every((o) => o.score === firstScore)).toBe(true);
    // Score version identical across all runs.
    expect(outputs.every((o) => o.version === SCORE_VERSION)).toBe(true);

    // Enrichment state DOES affect the recommendation surface: ready runs
    // surface LSI gap, error runs surface the fallback marker. This proves the
    // enrichment is still wired while being decoupled from the score.
    expect(outputs.some((o) => o.hasLsi)).toBe(true);
    expect(outputs.some((o) => o.hasFallback)).toBe(true);
  });
});

describe("ScoringEngine trust decoupling — VAL-A-TRUST-002 (graceful degradation)", () => {
  const originalEnv = process.env.NEURONWRITER_API_KEY;
  const originalAdapter = nwClient.defaults.adapter;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEURONWRITER_API_KEY = originalEnv;
    nwClient.defaults.adapter = originalAdapter as NonNullable<
      typeof nwClient.defaults.adapter
    >;
  });

  it("returns a valid score and a fallback marker when NEURONWRITER_API_KEY is missing", async () => {
    delete process.env.NEURONWRITER_API_KEY;

    const engine = new ScoringEngine();
    const context = buildContext({ includeNeuronWriter: true });

    const out = await engine.scorePage(context, Date.now());

    expect(out.overall.score).toBeGreaterThanOrEqual(0);
    expect(out.overall.score).toBeLessThanOrEqual(100);
    expect(out.finalScore).toBe(out.overall.score);

    const fallback = out.enrichmentIssues.find(
      (i) => i.code === "SEMANTIC_ENRICHMENT_UNAVAILABLE"
    );
    expect(fallback).toBeDefined();
    expect(fallback?.recommendation.length).toBeGreaterThan(0);

    expect(out.recommendations.some((r) => r.code === "SEMANTIC_LSI_GAP")).toBe(false);
    expect(out.recommendations.some((r) => r.code === "SEMANTIC_ENTITY_GAP")).toBe(false);
    // Score path did not crash and produced all 7 modules.
    expect(out.modules).toHaveLength(7);
  });

  it("returns a valid score when the NeuronWriter HTTP call throws", async () => {
    process.env.NEURONWRITER_API_KEY = "test_nw_key";
    nwClient.defaults.adapter = async () => {
      throw new Error("Simulated network failure");
    };

    const engine = new ScoringEngine();
    const context = buildContext({ includeNeuronWriter: true });

    const out = await engine.scorePage(context, Date.now());

    expect(out.overall.score).toBeGreaterThanOrEqual(0);
    expect(out.overall.score).toBeLessThanOrEqual(100);
    expect(out.modules).toHaveLength(7);
    const fallback = out.enrichmentIssues.find(
      (i) => i.code === "SEMANTIC_ENRICHMENT_UNAVAILABLE"
    );
    expect(fallback).toBeDefined();
    // Aggregator surface shape unchanged.
    expect(Array.isArray(out.recommendations)).toBe(true);
    expect(Array.isArray(out.quickWins)).toBe(true);
    expect(Array.isArray(out.topIssues)).toBe(true);
    expect(typeof out.platformReadiness.chatgpt).toBe("number");
  });
});

describe("ScoringEngine trust decoupling — VAL-A-TRUST-003 (score version)", () => {
  it("exposes a non-empty score_version constant", () => {
    expect(typeof SCORE_VERSION).toBe("string");
    expect(SCORE_VERSION.length).toBeGreaterThan(0);
    expect(SCORE_VERSION).toBe("seovista-score-v1.2-decoupled");
  });

  it("promotes overall.score_version into ScoreOutput and keeps legacy fields", async () => {
    const engine = new ScoringEngine();
    const context = buildContext({ includeNeuronWriter: false });

    const out = await engine.scorePage(context, Date.now());

    expect(out.overall).toBeDefined();
    expect(typeof out.overall.score).toBe("number");
    expect(out.overall.score_version).toBe(SCORE_VERSION);
    expect(out.overall.band).toBe(out.scoreBand);
    // Legacy fields preserved for existing consumers.
    expect(out.scoreVersion).toBe(SCORE_VERSION);
    expect(out.finalScore).toBe(out.overall.score);
  });
});
