import { describe, it, expect } from "vitest";
import { ScoringEngine } from "../engine.js";
import type { ScoreContext, ScoreModule, ScoreModuleResult } from "../types.js";

class FailingModule implements ScoreModule {
  key = "failing";
  label = "Failing Module";
  maxScore = 10;
  async run(_context: ScoreContext): Promise<ScoreModuleResult> {
    throw new Error("Simulated module breakdown");
  }
}

describe("Scoring Engine Graceful Degradation", () => {
  it("flags output as degraded when a module throws an unhandled error", async () => {
    const engine = new ScoringEngine();
    // Inject failing module
    (engine as unknown as { modules: ScoreModule[] }).modules.push(new FailingModule());

    const mockContext: ScoreContext = {
      tenantId: "test-tenant",
      url: "https://example.com",
      parsed: {
        statusCode: 200,
        headers: {},
        title: "Test",
        headings: [{ level: 1, text: "Hello" }],
        links: [],
        images: [],
        jsonLd: [],
        rawHtml: "<html><head><title>Test</title></head><body><h1>Hello</h1></body></html>",
        textContent: "Hello",
      },
    };

    const output = await engine.scorePage(mockContext, Date.now());

    expect(output.degraded).toBe(true);
    expect(output.breakdown.degraded).toBe(true);
  });
});
