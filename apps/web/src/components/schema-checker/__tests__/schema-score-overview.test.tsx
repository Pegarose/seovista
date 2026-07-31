import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { SchemaScoreOverview } from "../schema-score-overview";

describe("SchemaScoreOverview", () => {
  it("renders score, status and metrics correctly", () => {
    const html = renderToStaticMarkup(
      <SchemaScoreOverview
        score={95}
        rawScriptCount={2}
        parseErrorCount={0}
        prohibitedClaimCount={0}
      />
    );

    expect(html).toContain("95");
    expect(html).toContain("Yapısal Veri Skoru");
    expect(html).toContain("Mükemmel");
    expect(html).toContain("2");
    expect(html).toContain("Tespit Edilen Schema Script");
    expect(html).toContain("Ayrıştırma Hatası");
    expect(html).toContain("Yasaklı/Hileli İddia");
  });

  it("renders good status for scores in the 80-89 band", () => {
    const html = renderToStaticMarkup(
      <SchemaScoreOverview
        score={85}
        rawScriptCount={2}
        parseErrorCount={0}
        prohibitedClaimCount={0}
      />
    );

    expect(html).toContain("85");
    expect(html).toContain("İyi");
  });

  it("renders warning status for the needs-improvement band", () => {
    const html = renderToStaticMarkup(
      <SchemaScoreOverview
        score={60}
        rawScriptCount={1}
        parseErrorCount={1}
        prohibitedClaimCount={1}
      />
    );

    expect(html).toContain("60");
    expect(html).toContain("İyileştirilebilir");
  });

  it("renders danger status for the poor band", () => {
    const html = renderToStaticMarkup(
      <SchemaScoreOverview
        score={45}
        rawScriptCount={1}
        parseErrorCount={1}
        prohibitedClaimCount={1}
      />
    );

    expect(html).toContain("45");
    expect(html).toContain("Zayıf");
  });

  it("renders danger status for the critical band", () => {
    const html = renderToStaticMarkup(
      <SchemaScoreOverview
        score={30}
        rawScriptCount={0}
        parseErrorCount={2}
        prohibitedClaimCount={1}
      />
    );

    expect(html).toContain("30");
    expect(html).toContain("Kritik / Hatalı");
  });
});
