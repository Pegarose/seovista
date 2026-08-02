import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendChart } from "../components/tracker/trend-chart";

// Helper: generate N daily observations descending (as the repository returns them).
function makeObservations(positions: number[]): Array<{ position: number; checkedAt: string }> {
  return positions.map((pos, i) => {
    const date = new Date(2026, 6, 1 + i); // July 1, 2, 3, ...
    return { position: pos, checkedAt: date.toISOString() };
  }).reverse(); // DESC like the repository
}

// React's static renderer HTML-escapes apostrophes to `&#x27;`. Decode before
// assertions that match text containing apostrophes.
function decodeEntities(s: string): string {
  return s.replace(/&#x27;/g, "'");
}

describe("TrendChart", () => {
  it("renders an SVG with role=img and aria-label containing the keyword", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5, 3, 2]),
        keyword: "seo denetimi",
      }),
    );
    expect(markup).toContain("<svg");
    expect(markup).toContain('role="img"');
    expect(markup).toContain("seo denetimi");
  });

  it("inverts Y axis: position 1 point has smaller cy than position 10", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([1, 10]),
        keyword: "test",
      }),
    );
    // Extract cy values from circles
    const cyMatches = [...markup.matchAll(/cy="([\d.]+)"/g)];
    expect(cyMatches.length).toBeGreaterThanOrEqual(2);
    const cy1 = parseFloat(cyMatches[0]![1]!);
    const cy2 = parseFloat(cyMatches[1]![1]!);
    // Position 1 (first observation) should have smaller y (higher on screen)
    expect(cy1).toBeLessThan(cy2);
  });

  it("renders position=0 as amber circle with 'İlk 10'da yok' title", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([3, 0, 5]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("#f59e0b"); // amber-500
    expect(decodeEntities(markup)).toContain("İlk 10'da yok");
  });

  it("renders a <title> tooltip with date and position for in-top-10 points", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([3]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<title");
    expect(markup).toContain("#3");
  });

  it("renders a <details> element with a data table containing all observations", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5, 3, 2]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<details");
    expect(markup).toContain("<table");
    expect(markup).toContain("Veri tablosunu göster");
  });

  it("renders null for empty observations", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: [],
        keyword: "test",
      }),
    );
    expect(markup).toBe("");
  });

  it("renders a single circle without polyline for single observation", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TrendChart, {
        observations: makeObservations([5]),
        keyword: "test",
      }),
    );
    expect(markup).toContain("<circle");
    expect(markup).not.toContain("<polyline");
  });
});
