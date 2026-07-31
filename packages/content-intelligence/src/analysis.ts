/**
 * Content analysis engine.
 *
 * Computes deterministic scores, readability, keyword density,
 * heading/title/body coverage, and actionable recommendations.
 * Every output is deterministic — same input → same output.
 */

import { createTypedError, typedErrorCodes } from "./typed-errors.js";
import type { TypedError } from "./typed-errors.js";

// ── Public types ───────────────────────────────────────────────────────────

export interface AnalysisInput {
  readonly title: string;
  readonly body: string;
  readonly headings: readonly string[];
  readonly targetKeywords?: readonly string[];
  readonly lsiTerms?: readonly string[];
  readonly entities?: readonly string[];
}

export interface AnalysisRecommendation {
  readonly type: "missing_keyword_title" | "missing_keyword_body" | "missing_keyword_headings" | "weak_readability" | "low_keyword_density" | "high_keyword_density" | "missing_lsi" | "missing_entity" | "heading_coverage";
  readonly message: string;
  readonly priority: "high" | "medium" | "low";
}

export interface ReadabilityMetrics {
  readonly fleschReadingEase: number;
  readonly averageSentenceLength: number;
  readonly complexWordRatio: number;
}

export interface KeywordDensityMetrics {
  readonly overall: number;
  readonly inTitle: number;
  readonly inBody: number;
  readonly inHeadings: number;
}

export interface CoverageMetrics {
  readonly titleCoverage: number;
  readonly bodyCoverage: number;
  readonly headingCoverage: number;
  readonly lsiCoverage: number;
  readonly entityCoverage: number;
}

export interface AnalysisOutput {
  /** Content Alignment Score, bounded 0–100 inclusive. */
  readonly score: number;
  readonly readability: ReadabilityMetrics;
  readonly keywordDensity: KeywordDensityMetrics;
  readonly coverage: CoverageMetrics;
  /** Convenience aliases matching CoverageMetrics for direct access. */
  readonly titleCoverage: number;
  readonly bodyCoverage: number;
  readonly headingCoverage: number;
  readonly lsiCoverage: number;
  readonly entityCoverage: number;
  readonly recommendations: readonly AnalysisRecommendation[];
  readonly headingCounts: Record<string, number>;
}

/** Type guard: true when the value is a typed analysis error. */
export function isAnalysisError(value: unknown): value is TypedError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "retryable" in value &&
    "message" in value &&
    typeof (value as TypedError).code === "string" &&
    typeof (value as TypedError).retryable === "boolean" &&
    typeof (value as TypedError).message === "string"
  );
}

// ── Implementation ─────────────────────────────────────────────────────────

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string");
}

/**
 * Analyze content and return a deterministic score with recommendations.
 *
 * Returns a `TypedError` for malformed input.
 */
export function analyzeContent(input: AnalysisInput): AnalysisOutput | TypedError {
  if (!input || typeof input !== "object") {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "Analysis input must be a valid object",
    });
  }

  if (
    typeof input.title !== "string" ||
    typeof input.body !== "string" ||
    !isStringArray(input.headings) ||
    (input.targetKeywords !== undefined && !isStringArray(input.targetKeywords)) ||
    (input.lsiTerms !== undefined && !isStringArray(input.lsiTerms)) ||
    (input.entities !== undefined && !isStringArray(input.entities))
  ) {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "Analysis input contains malformed fields",
    });
  }

  const title = input.title;
  const body = input.body;
  const headings = input.headings;
  const keywords = input.targetKeywords ?? [];
  const lsiTerms = input.lsiTerms ?? [];
  const entities = input.entities ?? [];

  // Normalize for comparison
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  const headingsLower = headings.map((h) => h.toLowerCase());

  // Count heading levels
  const headingCounts: Record<string, number> = {};
  for (const h of headings) {
    headingCounts[h] = (headingCounts[h] ?? 0) + 1;
  }

  // ── Coverage ──────────────────────────────────────────────────────────
  const keywordCount = keywords.length;
  const titleCoverage = keywordCount === 0 ? 1 : keywords.filter((kw) => titleLower.includes(kw.toLowerCase())).length / keywordCount;
  const bodyCoverage = keywordCount === 0 ? 1 : keywords.filter((kw) => bodyLower.includes(kw.toLowerCase())).length / keywordCount;
  const headingCoverage = keywordCount === 0 ? 1
    : keywords.filter((kw) => headingsLower.some((h) => h.includes(kw.toLowerCase()))).length / keywordCount;

  const lsiCount = lsiTerms.length;
  const lsiCoverage = lsiCount === 0 ? 1
    : lsiTerms.filter((t) => bodyLower.includes(t.toLowerCase()) || titleLower.includes(t.toLowerCase())).length / lsiCount;

  const entityCount = entities.length;
  const entityCoverage = entityCount === 0 ? 1
    : entities.filter((e) => bodyLower.includes(e.toLowerCase()) || titleLower.includes(e.toLowerCase())).length / entityCount;

  // ── Readability ────────────────────────────────────────────────────────
  const readability = computeReadability(body);

  // ── Keyword density ────────────────────────────────────────────────────
  const density = computeKeywordDensity(title, body, headings, keywords);

  // ── Score ──────────────────────────────────────────────────────────────
  // Weighted combination: coverage 40%, keyword density relevance 30%, readability 15%, heading structure 15%
  const coverageScore = (titleCoverage * 0.25 + bodyCoverage * 0.4 + headingCoverage * 0.2 + lsiCoverage * 0.1 + entityCoverage * 0.05) * 40;

  // Density: 1-3% is ideal, penalty outside
  let densityScore = 0;
  if (keywordCount > 0) {
    if (density.overall >= 1 && density.overall <= 3) {
      densityScore = 30;
    } else if (density.overall < 1) {
      densityScore = Math.max(0, density.overall * 30); // 0-30 based on proximity
    } else if (density.overall <= 5) {
      densityScore = 30 - (density.overall - 3) * 5; // gentle penalty
    } else {
      densityScore = Math.max(0, 20 - (density.overall - 5) * 3);
    }
  } else {
    densityScore = 15; // neutral when no keywords
  }

  // Readability: 0-15
  let readabilityScore = 0;
  if (body.length > 0) {
    if (readability.fleschReadingEase >= 60 && readability.fleschReadingEase <= 70) {
      readabilityScore = 15;
    } else if (readability.fleschReadingEase >= 50 && readability.fleschReadingEase <= 80) {
      readabilityScore = 12;
    } else if (readability.fleschReadingEase >= 30 && readability.fleschReadingEase <= 90) {
      readabilityScore = 8;
    } else {
      readabilityScore = 4;
    }
  }

  // Heading structure: 0-15
  let headingScore = 0;
  if (headings.length > 0) {
    headingScore = Math.min(15, headings.length * 3);
  }

  const rawScore = coverageScore + densityScore + readabilityScore + headingScore;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // ── Recommendations ────────────────────────────────────────────────────
  const recommendations: AnalysisRecommendation[] = [];

  if (keywordCount > 0) {
    if (titleCoverage < 0.5) {
      recommendations.push({
        type: "missing_keyword_title",
        message: "Target keyword not found in title. Include the primary keyword in the page title for better SEO.",
        priority: "high",
      });
    }
    if (bodyCoverage < 0.5) {
      recommendations.push({
        type: "missing_keyword_body",
        message: "Target keywords have low coverage in the body. Naturally incorporate keywords into the content.",
        priority: "medium",
      });
    }
    if (headingCoverage < 0.5) {
      recommendations.push({
        type: "missing_keyword_headings",
        message: "Target keywords missing from headings. Use keywords in H2/H3 tags where relevant.",
        priority: "medium",
      });
    }
    if (density.overall < 1) {
      recommendations.push({
        type: "low_keyword_density",
        message: "Keyword density is below 1%. Consider adding relevant keyword mentions naturally.",
        priority: "low",
      });
    }
    if (density.overall > 5) {
      recommendations.push({
        type: "high_keyword_density",
        message: "Keyword density is above 5%. Reduce keyword repetition to avoid keyword stuffing.",
        priority: "high",
      });
    }
  }

  if (body.length > 0 && readability.fleschReadingEase < 50) {
    recommendations.push({
      type: "weak_readability",
      message: "Content readability is low. Use shorter sentences and simpler words for better engagement.",
      priority: "medium",
    });
  }

  if (lsiTerms.length > 0 && lsiCoverage < 0.5) {
    recommendations.push({
      type: "missing_lsi",
      message: "LSI terms have low coverage. Include semantically related terms to improve topical relevance.",
      priority: "low",
    });
  }

  if (entities.length > 0 && entityCoverage < 0.5) {
    recommendations.push({
      type: "missing_entity",
      message: "Named entities have low coverage. Mention relevant entities to improve content authority.",
      priority: "low",
    });
  }

  if (headings.length === 0 && body.length > 100) {
    recommendations.push({
      type: "heading_coverage",
      message: "Content has no headings. Add H2/H3 headings to structure the content and improve readability.",
      priority: "medium",
    });
  }

  return {
    score,
    readability,
    keywordDensity: density,
    coverage: {
      titleCoverage,
      bodyCoverage,
      headingCoverage,
      lsiCoverage,
      entityCoverage,
    },
    titleCoverage,
    bodyCoverage,
    headingCoverage,
    lsiCoverage,
    entityCoverage,
    recommendations,
    headingCounts,
  };
}

// ── Readability computation ────────────────────────────────────────────────

function computeReadability(text: string): ReadabilityMetrics {
  if (text.length === 0) {
    return { fleschReadingEase: 100, averageSentenceLength: 0, complexWordRatio: 0 };
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  const totalSentences = sentences.length || 1;
  const totalWords = words.length || 1;

  const averageSentenceLength = totalWords / totalSentences;

  const complexWords = words.filter((w) => countSyllables(w) >= 3).length;
  const complexWordRatio = complexWords / totalWords;

  // Flesch Reading Ease: 206.835 - 1.015 * ASL - 84.6 * ASW
  const fleschReadingEase = Math.round(
    Math.max(0, Math.min(100, 206.835 - 1.015 * averageSentenceLength - 84.6 * (complexWords / totalWords))),
  );

  return { fleschReadingEase, averageSentenceLength, complexWordRatio };
}

function countSyllables(word: string): number {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length <= 3) return 1;

  let count = 0;
  let prevVowel = false;
  for (let i = 0; i < lower.length; i++) {
    const isVowel = "aeiouy".includes(lower[i]!);
    if (isVowel && !prevVowel) {
      count++;
    }
    prevVowel = isVowel;
  }
  // Adjust for silent e
  if (lower.endsWith("e") && count > 1) {
    count--;
  }
  return Math.max(1, count);
}

// ── Keyword density ────────────────────────────────────────────────────────

function computeKeywordDensity(
  title: string,
  body: string,
  headings: readonly string[],
  keywords: readonly string[],
): KeywordDensityMetrics {
  const allText = [title, body, ...headings].join(" ");
  const allWords = allText.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = allWords.length || 1;

  if (keywords.length === 0) {
    return { overall: 0, inTitle: 0, inBody: 0, inHeadings: 0 };
  }

  const keywordRegex = new RegExp(
    keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "gi",
  );

  const allMatches = (allText.match(keywordRegex) ?? []).length;
  const overall = (allMatches / totalWords) * 100;

  const titleWords = title.split(/\s+/).filter((w) => w.length > 0).length || 1;
  const titleMatches = (title.match(keywordRegex) ?? []).length;
  const inTitle = (titleMatches / titleWords) * 100;

  const bodyWords = body.split(/\s+/).filter((w) => w.length > 0).length || 1;
  const bodyMatches = (body.match(keywordRegex) ?? []).length;
  const inBody = (bodyMatches / bodyWords) * 100;

  const headingsText = headings.join(" ");
  const headingWords = headingsText.split(/\s+/).filter((w) => w.length > 0).length || 1;
  const headingMatches = (headingsText.match(keywordRegex) ?? []).length;
  const inHeadings = (headingMatches / headingWords) * 100;

  return {
    overall: Math.round(overall * 100) / 100,
    inTitle: Math.round(inTitle * 100) / 100,
    inBody: Math.round(inBody * 100) / 100,
    inHeadings: Math.round(inHeadings * 100) / 100,
  };
}
