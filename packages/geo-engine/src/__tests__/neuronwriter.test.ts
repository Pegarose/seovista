import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { ScoringEngine } from "../engine.js";
import { nwClient } from "../providers/neuronwriter.js";
import type { ScoreContext } from "../types.js";

describe("NeuronWriter semantic enrichment", () => {
  const originalEnv = process.env.NEURONWRITER_API_KEY;
  const originalAdapter: (typeof nwClient.defaults.adapter) = nwClient.defaults.adapter;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEURONWRITER_API_KEY = originalEnv;
    nwClient.defaults.adapter = originalAdapter as NonNullable<typeof nwClient.defaults.adapter>;
    vi.unstubAllGlobals();
  });

  it("awaits NeuronWriter async enrichment and reflects provider data in semanticAnalysis", async () => {
    process.env.NEURONWRITER_API_KEY = "test_nw_key";

    const newQueryResponse = { query: "test-query-id" };
    const getQueryResponse = {
      status: "ready",
      terms: {
        content_basic: [{ t: "semantic seo", usage_pc: 80 }, { t: "nlp optimization", usage_pc: 70 }],
        content_extended: [{ t: "entity coverage", usage_pc: 60 }],
        h2: [{ t: "lsi keywords" }, { t: "topic clusters" }],
        entities: [{ t: "Semantic SEO" }, { t: "NLP" }],
      },
      ideas: {
        suggest_questions: [{ q: "What is semantic SEO?" }],
      },
    };

    nwClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const urlString = typeof config.url === "string" ? config.url : String(config.url);
      const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data as Record<string, unknown>);

      if (urlString.includes("/new-query")) {
        expect(config.method).toBe("post");
        expect(config.headers?.["X-API-KEY"]).toBe("test_nw_key");
        expect(body.keyword).toBe("semantic seo");
        return {
          data: newQueryResponse,
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }

      if (urlString.includes("/get-query")) {
        expect(config.method).toBe("post");
        expect(body.query).toBe("test-query-id");
        return {
          data: getQueryResponse,
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }

      throw new Error(`Unexpected axios call: ${urlString}`);
    };

    const engine = new ScoringEngine();

    const { enrichWithNeuronWriter } = await import("../providers/neuronwriter.js");
    const directEnrichment = await enrichWithNeuronWriter({
      tenantId: "test-tenant",
      targetKeyword: "semantic seo",
      parsed: {
        statusCode: 200,
        headers: {},
        title: "Semantic SEO Guide",
        headings: [{ level: 1, text: "Semantic SEO Guide" }],
        links: [],
        images: [],
        jsonLd: [],
        rawHtml: "",
        textContent: "",
      },
    } as unknown as ScoreContext);
    expect(directEnrichment.queryId).toBe("test-query-id");

    const context: ScoreContext = {
      tenantId: "test-tenant",
      url: "https://example.com/semantic-seo",
      normalizedUrl: "https://example.com/semantic-seo",
      targetKeyword: "semantic seo",
      parsed: {
        statusCode: 200,
        headers: {},
        title: "Semantic SEO Guide",
        metaDescription: "A guide to semantic SEO",
        headings: [
          { level: 1, text: "Semantic SEO Guide" },
          { level: 2, text: "Introduction" },
        ],
        links: [],
        images: [],
        jsonLd: [],
        rawHtml: "<html><body><h1>Semantic SEO Guide</h1><p>Introduction to semantic SEO.</p></body></html>",
        textContent: "Semantic SEO Guide Introduction to semantic SEO.",
      },
      options: {
        includeNeuronWriter: true,
        includePerformance: false,
        includeAiVisibility: false,
        renderJavascript: false,
        storeSnapshot: false,
      },
    };

    const result = await engine.scorePage(context, Date.now());

    expect(result.providerEnrichments).toHaveLength(1);
    const enrichment = result.providerEnrichments?.[0];
    expect(enrichment?.provider).toBe("neuronwriter");
    expect(enrichment?.queryId).toBe("test-query-id");
    expect(enrichment?.recommendedHeadings).toContain("lsi keywords");
    expect(enrichment?.recommendedHeadings).toContain("What is semantic SEO?");

    expect(result.semanticAnalysis).toBeDefined();
    const semanticAnalysis = result.semanticAnalysis ?? {};
    expect(semanticAnalysis.provider).toBe("neuronwriter");
    expect(semanticAnalysis.missingLsiTerms).toContain("nlp optimization");
    expect(semanticAnalysis.missingLsiTerms).toContain("entity coverage");
    expect(semanticAnalysis.missingEntities).toContain("NLP");

    // The scoring engine should report semantic gap issues derived from the enrichment.
    const semanticModule = result.modules.find((m) => m.key === "semantic_coverage");
    expect(semanticModule).toBeDefined();
    expect(semanticModule?.score).toBeLessThan(semanticModule?.maxScore ?? 15);
  });

  it("gracefully returns an error enrichment when NEURONWRITER_API_KEY is missing", async () => {
    delete process.env.NEURONWRITER_API_KEY;

    const engine = new ScoringEngine();
    const context: ScoreContext = {
      tenantId: "test-tenant",
      parsed: {
        statusCode: 200,
        headers: {},
        title: "Page Title",
        headings: [{ level: 1, text: "Page Title" }],
        links: [],
        images: [],
        jsonLd: [],
        rawHtml: "<html><body><h1>Page Title</h1></body></html>",
        textContent: "Page Title",
      },
      options: {
        includeNeuronWriter: true,
        includePerformance: false,
        includeAiVisibility: false,
        renderJavascript: false,
        storeSnapshot: false,
      },
    };

    const result = await engine.scorePage(context, Date.now());
    expect(result.providerEnrichments).toHaveLength(1);
    const enrichment = result.providerEnrichments?.[0];
    expect(enrichment).toBeDefined();
    expect(enrichment?.status).toBe("error");
    expect(enrichment?.error).toContain("NEURONWRITER_API_KEY");
  });
});
