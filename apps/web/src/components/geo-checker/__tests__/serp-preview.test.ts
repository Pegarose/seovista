import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SerpPreview } from "../serp-preview";

describe("SERP & AI Answer Preview Component", () => {
  it("renders Google SERP preview snippet correctly", () => {
    const html = renderToStaticMarkup(
      SerpPreview({
        url: "https://seovista.com",
        title: "SeoVista - Global GEO & Search Visibility",
        snippet: "Optimize your brand to be found, understood and cited by AI search engines.",
        mode: "serp",
      })
    );

    expect(html).toContain("seovista.com");
    expect(html).toContain("SeoVista - Global GEO");
    expect(html).toContain("Optimize your brand to be found");
  });

  it("renders AI Answer Citation preview snippet correctly", () => {
    const html = renderToStaticMarkup(
      SerpPreview({
        url: "https://seovista.com",
        title: "SeoVista",
        snippet: "According to SeoVista, Generative Engine Optimization requires structured entity signals.",
        mode: "ai_answer",
      })
    );

    expect(html).toContain("AI Overview Citation Preview");
    expect(html).toContain("According to SeoVista");
  });
});
