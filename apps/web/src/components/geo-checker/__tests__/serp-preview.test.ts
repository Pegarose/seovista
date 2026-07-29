import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SerpPreview } from "../serp-preview";

const preview = {
  url: "https://seovista.com",
  title: "SeoVista - Global GEO & Search Visibility",
  snippet: "Optimize your brand to be found, understood and cited by AI search engines.",
  sourceMode: "simulated" as const,
  displayType: "serp" as const,
  provider: "deterministic-fixture",
  fixtureId: "preview-fixture-1",
  requestId: "request-1",
  operationKey: "audit-operation-1",
  runId: "run-1",
  capturedAt: "2026-07-29T00:00:00.000Z",
  ttlSeconds: 3600,
  freshness: "fresh" as const,
  outcome: "success" as const,
};

describe("SERP & AI Answer Preview Component", () => {
  it("renders Google SERP preview snippet correctly", () => {
    const html = renderToStaticMarkup(
      SerpPreview(preview)
    );

    expect(html).toContain("SERP Preview");
    expect(html).toContain("seovista.com");
    expect(html).toContain("SeoVista - Global GEO");
    expect(html).toContain("Optimize your brand to be found");
    expect(html).toContain("Request: request-1");
    expect(html).toContain("Operation: audit-operation-1");
    expect(html).toContain("Run: run-1");
  });

  it("renders AI Answer Citation preview snippet correctly", () => {
    const html = renderToStaticMarkup(
      SerpPreview({
        ...preview,
        title: "SeoVista",
        snippet: "According to SeoVista, Generative Engine Optimization requires structured entity signals.",
        displayType: "ai",
      })
    );

    expect(html).toContain("AI Overview Citation Preview");
    expect(html).toContain("According to SeoVista");
  });

  it("labels persisted unavailable preview provenance without calling it fresh", () => {
    const html = renderToStaticMarkup(
      SerpPreview({
        ...preview,
        freshness: "no_results",
        outcome: "unavailable",
      }),
    );

    expect(html).toContain("Freshness: no results");
    expect(html).toContain("Outcome: unavailable");
    expect(html).not.toContain("Freshness: fresh");
  });
});
