import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertsList } from "../../src/components/tracker/alerts-list";

describe("AlertsList", () => {
  it("renders the alerts heading and kind labels", () => {
    const el = React.createElement(AlertsList, {
      alerts: [
        { id: "a1", kind: "dropped_out_of_top10", fromPosition: 4, toPosition: 0, observedAt: "2026-08-03T03:00:00.000Z", keyword: "seo", domain: "a.com" },
        { id: "a2", kind: "significant_rise", fromPosition: 8, toPosition: 3, observedAt: "2026-08-02T03:00:00.000Z", keyword: "sem", domain: "a.com" },
      ],
      email: "user@example.com",
      token: "************************************",
    });
    const markup = decodeEntities(renderToStaticMarkup(el));
    expect(markup).toContain("Uyarılar");
    expect(markup).toContain("İlk 10'dan düştü");
    expect(markup).toContain("Belirgin yükseliş");
    expect(countTag(markup, "h2")).toBe(1);
  });

  it("renders the empty state when there are no alerts", () => {
    const el = React.createElement(AlertsList, { alerts: [], email: "a@example.com", token: "************************************" });
    const markup = decodeEntities(renderToStaticMarkup(el));
    expect(markup).toContain("Henüz uyarı yok");
  });
});

function countTag(markup: string, tag: string): number {
  return (markup.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function decodeEntities(markup: string): string {
  return markup.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}
