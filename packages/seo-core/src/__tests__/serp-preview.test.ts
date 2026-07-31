import { describe, expect, it } from "vitest";
import {
  analyzeSerpSnippet,
  measurePixelWidth,
  SERP_CHAR_GUIDANCE,
  SERP_LIMITS,
  truncateAtPixelWidth,
} from "../serp-preview";

describe("measurePixelWidth", () => {
  it("returns 0 for empty string", () => {
    expect(measurePixelWidth("", 20)).toBe(0);
  });
  it("wide characters cost more than narrow ones", () => {
    expect(measurePixelWidth("WWWWW", 20)).toBeGreaterThan(measurePixelWidth("iiiii", 20));
  });
  it("scales linearly with font size", () => {
    expect(measurePixelWidth("seo", 40)).toBe(measurePixelWidth("seo", 20) * 2);
  });
  it("handles Turkish characters", () => {
    expect(measurePixelWidth("ÇğİöŞü", 20)).toBeGreaterThan(0);
  });
});

describe("truncateAtPixelWidth", () => {
  it("returns original text when within limit", () => {
    const result = truncateAtPixelWidth("kısa başlık", 600, 20);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("kısa başlık");
  });
  it("truncates with ellipsis and reserves its width", () => {
    const long = "Bu çok uzun bir sayfa başlığıdır ve Google sonuçlarında kesinlikle kısaltılacaktır";
    const result = truncateAtPixelWidth(long, 200, 20);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(measurePixelWidth(result.text, 20)).toBeLessThanOrEqual(200);
  });
});

describe("analyzeSerpSnippet", () => {
  it("flags over-limit title as truncated on desktop", () => {
    const analysis = analyzeSerpSnippet("W".repeat(40), "kısa açıklama");
    expect(analysis.desktop.title.truncated).toBe(true);
    expect(analysis.desktop.title.maxPixelWidth).toBe(SERP_LIMITS.desktop.titleMaxPx);
  });
  it("computes character guidance bands", () => {
    const short = analyzeSerpSnippet("kısa", "kısa");
    expect(short.titleGuidance).toBe("too-short");
    expect(short.descriptionGuidance).toBe("too-short");
    const ok = analyzeSerpSnippet("x".repeat(55), "x".repeat(120));
    expect(ok.titleGuidance).toBe("ok");
    expect(ok.descriptionGuidance).toBe("ok");
    const long = analyzeSerpSnippet("x".repeat(SERP_CHAR_GUIDANCE.title.max + 1), "x".repeat(SERP_CHAR_GUIDANCE.description.max + 1));
    expect(long.titleGuidance).toBe("too-long");
    expect(long.descriptionGuidance).toBe("too-long");
  });
  it("handles empty input without errors", () => {
    const analysis = analyzeSerpSnippet("", "");
    expect(analysis.desktop.title.pixelWidth).toBe(0);
    expect(analysis.desktop.title.truncated).toBe(false);
  });
});
