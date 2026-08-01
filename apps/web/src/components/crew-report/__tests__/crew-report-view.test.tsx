// @vitest-environment happy-dom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CrewReportResultPayload } from "@seovista/worker";
import { CrewReportView } from "../crew-report-view";
import { GUARDRAIL_LABELS, transformGuardrailLabels } from "../guardrail";

const GENERATED_AT = "2026-08-01T12:34:56.000Z";

function makeReport(reportMarkdown: string): CrewReportResultPayload {
  return {
    kind: "crew-report",
    dataSource: "crew-agency",
    sourceJobId: "11111111-2222-4333-8444-555555555555",
    tool: "geo-readiness",
    endpoint: "/api/rapor-uret",
    reportMarkdown,
    crewJobId: "crew-abc",
    generatedAt: GENERATED_AT,
  };
}

function renderReport(markdown: string): string {
  return renderToStaticMarkup(<CrewReportView report={makeReport(markdown)} />);
}

describe("transformGuardrailLabels", () => {
  it("wraps known labels in the guardrail strong marker", () => {
    expect(transformGuardrailLabels("[SİMÜLASYON] sonuç")).toBe("**⟦G:SİMÜLASYON⟧** sonuç");
    expect(transformGuardrailLabels("[VERİ EKSİK]")).toBe("**⟦G:VERİ EKSİK⟧**");
    expect(transformGuardrailLabels("[KARAR GEREKLİ]")).toBe("**⟦G:KARAR GEREKLİ⟧**");
  });

  it("matches labels Turkish-uppercase aware (tr locale)", () => {
    // "i" must uppercase to Turkish dotted "İ".
    expect(transformGuardrailLabels("[Tahmin]")).toBe("**⟦G:TAHMİN⟧**");
    expect(transformGuardrailLabels("[hesaplanan]")).toBe("**⟦G:HESAPLANAN⟧**");
  });

  it("leaves unknown bracket text untouched", () => {
    expect(transformGuardrailLabels("[BİLİNMEYEN] metin")).toBe("[BİLİNMEYEN] metin");
    expect(transformGuardrailLabels("[SOMETHING]")).toBe("[SOMETHING]");
  });
});

describe("CrewReportView", () => {
  it("renders all five guardrail labels as Turkish badge chips with descriptions", () => {
    const html = renderReport(
      "[SİMÜLASYON] [TAHMİN] [VERİ EKSİK] [KARAR GEREKLİ] [HESAPLANAN]"
    );

    for (const [key, meta] of Object.entries(GUARDRAIL_LABELS)) {
      expect(html).toContain(`data-guardrail="${key}"`);
      expect(html).toContain(meta.label);
      // Description is exposed via title (text + color, never color-only).
      expect(html).toContain(`title="${meta.description}"`);
    }
    expect(html).toContain("inline-flex");
    expect(html).toContain("rounded-full");
  });

  it("leaves unknown bracket text as plain text (no badge)", () => {
    const html = renderReport("[SOMETHING] burada düz metin");

    expect(html).toContain("[SOMETHING]");
    expect(html).not.toContain("data-guardrail=");
  });

  it("renders headings, lists and tables through the custom component map", () => {
    const html = renderReport(
      "## Alt Başlık\n\n- bir\n- iki\n\n| A | B |\n|---|---|\n| 1 | 2 |"
    );

    expect(html).toMatch(/<h2 class="[^"]*font-display[^"]*"/);
    expect(html).toContain("Alt Başlık");
    expect(html).toMatch(/<li[\s>]/);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("<table");
  });

  it("never emits an h1 (one-h1-per-page rule)", () => {
    const html = renderReport("# Ana Başlık\n\nMetin");

    expect(html).not.toContain("<h1");
    expect(html).toContain("Ana Başlık");
  });

  it("neutralizes raw HTML injection (script / img onerror)", () => {
    const html = renderReport(
      'Metin <script>alert(1)</script> ve <img src="x" onerror="alert(1)"> bitti'
    );

    // Raw HTML is disabled, so no executable markup survives; the payload
    // remains only as inert escaped text.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the header band with CrewAgency attribution, timestamp and AI disclaimer", () => {
    const html = renderReport("İçerik");

    expect(html).toContain("CrewAgency");
    expect(html).toContain(GENERATED_AT);
    expect(html).toMatch(/yapay zeka/i);
  });
});
