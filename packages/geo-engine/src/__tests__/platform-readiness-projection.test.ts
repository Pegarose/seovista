import { describe, expect, it } from "vitest";
import { ScoringEngine } from "../engine.js";
import type {
  AiVisibilityData,
  ScoreContext,
  ScoreModule,
  ScoreModuleResult,
} from "../types.js";

function buildContext(): ScoreContext {
  return {
    tenantId: "projection-test-tenant",
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    parsed: {
      statusCode: 200,
      headers: {},
      headings: [],
      links: [],
      images: [],
      jsonLd: [],
      rawHtml: "<html></html>",
      textContent: "",
    },
    options: {
      includeNeuronWriter: false,
      includePerformance: false,
      includeAiVisibility: true,
      renderJavascript: false,
      storeSnapshot: false,
    },
  };
}

function malformedProjectionModule(): ScoreModule {
  const platformReadiness: AiVisibilityData["platformReadiness"] = [
    {
      platform: "Valid Platform",
      score: 82,
      confidence: 0.8,
      rationale: "A persisted, bounded readiness estimate.",
      experimental: true,
    },
    {
      platform: "Out of range score",
      score: 101,
      confidence: 0.8,
      rationale: "Must be omitted.",
      experimental: true,
    },
    {
      platform: "Non-finite confidence",
      score: 82,
      confidence: Number.NaN,
      rationale: "Must be omitted.",
      experimental: true,
    },
    {
      platform: "Coerced boolean",
      score: 82,
      confidence: 0.8,
      rationale: "Must be omitted.",
      experimental: "false" as unknown as boolean,
    },
    {
      platform: "Blank rationale",
      score: 82,
      confidence: 0.8,
      rationale: "   ",
      experimental: true,
    },
  ];

  const aiVisibilityData: AiVisibilityData = {
    answerability: 1,
    citationReadiness: 1,
    entityClarity: 1,
    aiParseability: 1,
    sourceTrustSignals: 1,
    platformReadiness,
  };

  return {
    key: "ai_visibility_readiness",
    label: "AI Visibility Readiness",
    maxScore: 5,
    run: async (): Promise<ScoreModuleResult> => ({
      key: "ai_visibility_readiness",
      label: "AI Visibility Readiness",
      score: 5,
      maxScore: 5,
      status: "excellent",
      issues: [],
      recommendations: [],
      aiVisibilityData,
    }),
  };
}

describe("ScoringEngine platform-readiness projection", () => {
  it("keeps only complete finite bounded readiness entries in the observable breakdown", async () => {
    const engine = new ScoringEngine();
    const engineWithModules = engine as unknown as { modules: ScoreModule[] };
    engineWithModules.modules = [malformedProjectionModule()];

    const result = await engine.scorePage(buildContext(), 0);

    expect(result.breakdown.platformReadiness).toEqual([
      {
        platform: "Valid Platform",
        score: 82,
        confidence: 0.8,
        rationale: "A persisted, bounded readiness estimate.",
        experimental: true,
      },
    ]);
  });
});
