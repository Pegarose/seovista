/**
 * SERP pixel approximation — Arial advance-width table at 100px scale.
 * Deterministic estimate of Google's snippet truncation; never presented
 * as exact rendering (UI must label it "tahmini pixel ölçümü").
 */
const ARIAL_WIDTHS_AT_100: Readonly<Record<string, number>> = {
  " ": 28, "!": 28, '"': 36, "#": 56, "$": 56, "%": 89, "&": 67, "'": 19,
  "(": 33, ")": 33, "*": 39, "+": 58, ",": 28, "-": 33, ".": 28, "/": 28,
  "0": 56, "1": 56, "2": 56, "3": 56, "4": 56, "5": 56, "6": 56, "7": 56, "8": 56, "9": 56,
  ":": 28, ";": 28, "<": 58, "=": 58, ">": 58, "?": 56, "@": 102,
  A: 67, B: 67, C: 72, D: 72, E: 67, F: 61, G: 78, H: 72, I: 28, J: 50,
  K: 67, L: 56, M: 83, N: 72, O: 78, P: 67, Q: 78, R: 72, S: 67, T: 61,
  U: 72, V: 67, W: 94, X: 67, Y: 67, Z: 61,
  "[": 28, "\\": 28, "]": 28, "^": 47, _: 56, "`": 33,
  a: 56, b: 56, c: 50, d: 56, e: 56, f: 28, g: 56, h: 56, i: 22, j: 22,
  k: 50, l: 22, m: 83, n: 56, o: 56, p: 56, q: 56, r: 33, s: 50, t: 28,
  u: 56, v: 50, w: 72, x: 50, y: 50, z: 50,
  "{": 33, "|": 26, "}": 33, "~": 58, "…": 83,
  "ç": 50, "ğ": 56, "ı": 22, "ö": 56, "ş": 50, "ü": 56,
  "Ç": 72, "Ğ": 78, "İ": 28, "Ö": 78, "Ş": 67, "Ü": 72,
};
const DEFAULT_WIDTH_AT_100 = 56;
const ELLIPSIS = " …";

export function measurePixelWidth(text: string, fontSize: number): number {
  let widthAt100 = 0;
  for (const ch of text) {
    widthAt100 += ARIAL_WIDTHS_AT_100[ch] ?? DEFAULT_WIDTH_AT_100;
  }
  return (widthAt100 * fontSize) / 100;
}

export interface SerpTruncation {
  readonly text: string;
  readonly truncated: boolean;
}

export function truncateAtPixelWidth(text: string, maxPx: number, fontSize: number): SerpTruncation {
  if (measurePixelWidth(text, fontSize) <= maxPx) {
    return { text, truncated: false };
  }
  const ellipsisWidth = measurePixelWidth(ELLIPSIS, fontSize);
  let accumulated = 0;
  let cutIndex = 0;
  for (const ch of text) {
    const charWidth = ((ARIAL_WIDTHS_AT_100[ch] ?? DEFAULT_WIDTH_AT_100) * fontSize) / 100;
    if (accumulated + charWidth + ellipsisWidth > maxPx) break;
    accumulated += charWidth;
    cutIndex += ch.length;
  }
  return { text: text.slice(0, cutIndex).trimEnd() + ELLIPSIS, truncated: true };
}

export const SERP_LIMITS = {
  desktop: { titleFontSize: 20, titleMaxPx: 600, descriptionFontSize: 14, descriptionMaxPx: 990 },
  mobile: { titleFontSize: 18, titleMaxPx: 600, descriptionFontSize: 14, descriptionMaxPx: 720 },
} as const;

export const SERP_CHAR_GUIDANCE = {
  title: { min: 50, max: 60 },
  description: { min: 70, max: 160 },
} as const;

export type SerpGuidance = "too-short" | "ok" | "too-long";

export interface SerpVariantMetrics {
  readonly pixelWidth: number;
  readonly maxPixelWidth: number;
  readonly charCount: number;
  readonly truncated: boolean;
  readonly previewText: string;
}

export interface SerpAnalysis {
  readonly desktop: { title: SerpVariantMetrics; description: SerpVariantMetrics };
  readonly mobile: { title: SerpVariantMetrics; description: SerpVariantMetrics };
  readonly titleGuidance: SerpGuidance;
  readonly descriptionGuidance: SerpGuidance;
}

function guidanceFor(count: number, band: { min: number; max: number }): SerpGuidance {
  if (count < band.min) return "too-short";
  if (count > band.max) return "too-long";
  return "ok";
}

function variantMetrics(text: string, maxPx: number, fontSize: number): SerpVariantMetrics {
  const truncation = truncateAtPixelWidth(text, maxPx, fontSize);
  return {
    pixelWidth: measurePixelWidth(text, fontSize),
    maxPixelWidth: maxPx,
    charCount: text.length,
    truncated: truncation.truncated,
    previewText: truncation.text,
  };
}

export function analyzeSerpSnippet(title: string, description: string): SerpAnalysis {
  const d = SERP_LIMITS.desktop;
  const m = SERP_LIMITS.mobile;
  return {
    desktop: {
      title: variantMetrics(title, d.titleMaxPx, d.titleFontSize),
      description: variantMetrics(description, d.descriptionMaxPx, d.descriptionFontSize),
    },
    mobile: {
      title: variantMetrics(title, m.titleMaxPx, m.titleFontSize),
      description: variantMetrics(description, m.descriptionMaxPx, m.descriptionFontSize),
    },
    titleGuidance: guidanceFor(title.length, SERP_CHAR_GUIDANCE.title),
    descriptionGuidance: guidanceFor(description.length, SERP_CHAR_GUIDANCE.description),
  };
}
