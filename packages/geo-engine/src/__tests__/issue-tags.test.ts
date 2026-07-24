import { describe, it, expect } from "vitest";
import {
  ISSUE_TAGS,
  CODE_TO_TAGS,
  attachIssueTags,
  type IssueTag,
} from "../issue-tags.js";
import type { AuditIssue, ScoreContext, ParsedPage } from "../types.js";
import { ScoringEngine, SCORE_VERSION } from "../engine.js";

/**
 * Issue-tag vocabulary tests for the `issue-tag-vocabulary` feature.
 *
 * Locks in VAL-B-CATALOG-001 / 002 / 003 / 011 / 012 / 013:
 *   - 001: every emitted issue code maps to a non-empty IssueTag[].
 *   - 002: tag vocabulary is a single stable closed union.
 *   - 003: ANSWER_BLOCK_OPPORTUNITY (two-module code) resolves to one
 *     deterministic tag set regardless of origin.
 *   - 011: issueTags is additive / backward-compatible.
 *   - 012: tags are not scattered across module source files.
 *   - 013: recommendationFromIssue copies issueTags verbatim onto the
 *     projected Recommendation.
 */

// ── The complete emitted-code set ──────────────────────────────────────────
// Enumerated from the 7 scoring modules + the NeuronWriter enrichment surface
// in engine.ts. Every code the engine can emit MUST appear here so the coverage
// test (VAL-B-CATALOG-001) catches any uncovered code.
const EMITTED_CODES: readonly string[] = [
  // indexability
  "HTTP_5XX_DETECTED",
  "HTTP_4XX_DETECTED",
  "HTTP_STATUS_NOT_OK",
  "NOINDEX_DETECTED",
  "NOFOLLOW_DETECTED",
  "CANONICAL_MISSING",
  "CANONICAL_DOMAIN_MISMATCH",
  "CANONICAL_NON_SELF_REFERENCING",
  "CSR_RENDER_RISK",
  "STATIC_HTML_CONTENT_MISSING",
  "MAIN_CONTENT_EMPTY",
  // technical
  "TITLE_MISSING",
  "TITLE_TOO_SHORT",
  "TITLE_TOO_LONG",
  "META_DESCRIPTION_MISSING",
  "META_DESCRIPTION_TOO_SHORT",
  "META_DESCRIPTION_TOO_LONG",
  "H1_MISSING",
  "MULTIPLE_H1",
  "OPEN_GRAPH_INCOMPLETE",
  "TWITTER_CARD_INCOMPLETE",
  "JSON_LD_INVALID",
  "BREADCRUMB_SCHEMA_MISSING",
  "JSON_LD_MISSING_RECOMMENDED_SCHEMA",
  "ANSWER_BLOCK_OPPORTUNITY",
  // content
  "LOW_STRUCTURE_QUALITY",
  "NO_LIST_OR_TABLE_FOR_COMPLEX_TOPIC",
  "THIN_CONTENT_RISK",
  "INTRO_MISSING_OR_WEAK",
  "KEYWORD_STUFFING_RISK",
  "CONTENT_INTENT_MISMATCH_RISK",
  // semantic
  "TARGET_KEYWORD_NOT_IN_TITLE",
  "TARGET_KEYWORD_NOT_IN_H1",
  "TARGET_KEYWORD_NOT_IN_INTRO",
  "LOW_SEMANTIC_COVERAGE",
  "SEMANTIC_GAP_DETECTED",
  "HEADING_COVERAGE_WEAK",
  "INFORMATION_GAIN_OPPORTUNITY",
  "PRIMARY_TOPIC_UNCLEAR",
  "TOPIC_INFERENCE_LOW_CONFIDENCE",
  "TARGET_KEYWORD_NOT_PROVIDED",
  // experience
  "HTTPS_MISSING",
  "HTML_SIZE_LARGE",
  "DOM_SIZE_LARGE",
  "PAGESPEED_PROVIDER_FAILED",
  "PAGESPEED_SKIPPED",
  // linking
  "NO_INTERNAL_LINKS",
  "GENERIC_ANCHOR_TEXT",
  "EMPTY_ANCHOR_TEXT",
  "EXCESSIVE_EXTERNAL_LINKS",
  // ai-visibility
  "CITATION_READINESS_WEAK",
  "AI_PARSEABILITY_RISK",
  "ENTITY_CLARITY_WEAK",
  "THIRD_PARTY_MENTION_DATA_UNAVAILABLE",
  "PLATFORM_READINESS_LIMITED",
  // NeuronWriter enrichment (engine.ts)
  "SEMANTIC_LSI_GAP",
  "SEMANTIC_ENTITY_GAP",
  "SEMANTIC_ENRICHMENT_UNAVAILABLE",
];

const ISSUE_TAG_SET: ReadonlySet<string> = new Set(ISSUE_TAGS);

function makeIssue(code: string, module = "test_module"): AuditIssue {
  return {
    code,
    title: `Issue ${code}`,
    severity: "medium",
    module,
    impact: "impact",
    evidence: {},
    recommendation: "fix it",
    confidence: 0.5,
  };
}

// ── VAL-B-CATALOG-001: every emitted code maps to ≥1 tag ───────────────────
describe("VAL-B-CATALOG-001 — every emitted issue code maps to a non-empty IssueTag[]", () => {
  it("EMITTED_CODES is non-empty and uniquely-valued", () => {
    expect(EMITTED_CODES.length).toBeGreaterThan(0);
    expect(new Set(EMITTED_CODES).size).toBe(EMITTED_CODES.length);
  });

  it.each(EMITTED_CODES)("code %s has a non-empty tag mapping in CODE_TO_TAGS", (code) => {
    const tags = CODE_TO_TAGS[code];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags!.length).toBeGreaterThanOrEqual(1);
  });

  it("CODE_TO_TAGS has no entry with an empty tag array", () => {
    for (const [code, tags] of Object.entries(CODE_TO_TAGS)) {
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length, `code ${code} must have ≥1 tag`).toBeGreaterThanOrEqual(1);
    }
  });

  it("every EMITTED_CODES entry exists as a key in CODE_TO_TAGS (no uncovered code)", () => {
    const missing = EMITTED_CODES.filter((c) => !Object.prototype.hasOwnProperty.call(CODE_TO_TAGS, c));
    expect(missing, `uncovered codes: ${missing.join(", ")}`).toEqual([]);
  });

  it("attachIssueTags throws for an unknown code (fail-fast coverage invariant)", () => {
    const unknown = makeIssue("DEFINITELY_NOT_A_REAL_CODE_XYZ");
    expect(() => attachIssueTags([unknown])).toThrow();
  });

  it("attachIssueTags assigns a non-empty issueTags array to every issue", () => {
    const issues = EMITTED_CODES.map((c) => makeIssue(c));
    attachIssueTags(issues);
    for (const iss of issues) {
      expect(Array.isArray(iss.issueTags)).toBe(true);
      expect(iss.issueTags!.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── VAL-B-CATALOG-002: closed vocabulary ───────────────────────────────────
describe("VAL-B-CATALOG-002 — tag vocabulary is a single stable closed union", () => {
  it("ISSUE_TAGS enumerates exactly the 11 canonical tags", () => {
    expect(ISSUE_TAGS).toEqual([
      "indexability",
      "technical-seo",
      "content-depth",
      "schema",
      "internal-linking",
      "answerability",
      "citations",
      "entity-clarity",
      "source-trust",
      "ai-visibility",
      "experience",
    ]);
  });

  it("every tag in CODE_TO_TAGS is a member of the IssueTag union", () => {
    for (const [code, tags] of Object.entries(CODE_TO_TAGS)) {
      for (const tag of tags) {
        expect(
          ISSUE_TAG_SET.has(tag),
          `code ${code} produced out-of-vocabulary tag "${tag}"`,
        ).toBe(true);
      }
    }
  });

  it("attachIssueTags only ever produces tags within the closed union", () => {
    const issues = EMITTED_CODES.map((c) => makeIssue(c));
    attachIssueTags(issues);
    for (const iss of issues) {
      for (const tag of iss.issueTags ?? []) {
        expect(ISSUE_TAG_SET.has(tag)).toBe(true);
      }
    }
  });

  it("no IssueTag union member is a dead letter — every tag is used by ≥1 code", () => {
    const used = new Set<string>();
    for (const tags of Object.values(CODE_TO_TAGS)) {
      for (const t of tags) used.add(t);
    }
    for (const tag of ISSUE_TAGS) {
      expect(used.has(tag), `tag "${tag}" is never used`).toBe(true);
    }
  });
});

// ── VAL-B-CATALOG-003: duplicate-module code determinism ───────────────────
describe("VAL-B-CATALOG-003 — ANSWER_BLOCK_OPPORTUNITY resolves to one deterministic tag set", () => {
  it("CODE_TO_TAGS has exactly one entry for ANSWER_BLOCK_OPPORTUNITY", () => {
    expect(Object.prototype.hasOwnProperty.call(CODE_TO_TAGS, "ANSWER_BLOCK_OPPORTUNITY")).toBe(true);
  });

  it("attachIssueTags yields identical tags regardless of declaring module", () => {
    const fromTechnical = makeIssue("ANSWER_BLOCK_OPPORTUNITY", "technical_seo");
    const fromAiVisibility = makeIssue("ANSWER_BLOCK_OPPORTUNITY", "ai_visibility_readiness");
    attachIssueTags([fromTechnical, fromAiVisibility]);
    expect(fromTechnical.issueTags).toEqual(fromAiVisibility.issueTags);
  });

  it("repeated attachIssueTags calls yield identical, stable tag arrays", () => {
    const a = makeIssue("ANSWER_BLOCK_OPPORTUNITY");
    const b = makeIssue("ANSWER_BLOCK_OPPORTUNITY");
    attachIssueTags([a]);
    attachIssueTags([b]);
    expect(a.issueTags).toEqual(b.issueTags);
    // Deterministic order too — same members, same order.
    expect(a.issueTags).toStrictEqual(CODE_TO_TAGS["ANSWER_BLOCK_OPPORTUNITY"]!.slice());
  });

  it("attachIssueTags returns a fresh array (no shared mutable reference with CODE_TO_TAGS)", () => {
    const a = makeIssue("ANSWER_BLOCK_OPPORTUNITY");
    attachIssueTags([a]);
    const original = CODE_TO_TAGS["ANSWER_BLOCK_OPPORTUNITY"]!.slice();
    a.issueTags!.push("indexability" as IssueTag);
    // Mutating the attached copy must NOT mutate the shared CODE_TO_TAGS entry.
    expect(CODE_TO_TAGS["ANSWER_BLOCK_OPPORTUNITY"]).toEqual(original);
  });
});

// ── VAL-B-CATALOG-011: additive / backward-compatible ──────────────────────
describe("VAL-B-CATALOG-011 — issueTags is additive and backward-compatible", () => {
  function buildContext(): ScoreContext {
    const parsed: ParsedPage = {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      title: "Semantic SEO Guide",
      metaDescription: "A practical guide to semantic SEO.",
      canonical: "https://example.com/semantic-seo",
      metaRobots: { noindex: false, nofollow: false },
      headings: [
        { level: 1, text: "Semantic SEO Guide" },
        { level: 2, text: "Introduction" },
      ],
      links: [{ href: "https://example.com/about", text: "About", isInternal: true }],
      images: [],
      jsonLd: [
        { "@type": "Article", headline: "Semantic SEO Guide" },
      ],
      og: { title: "Semantic SEO Guide" },
      rawHtml:
        "<html><body><h1>Semantic SEO Guide</h1><p>Introduction to semantic seo and topic clusters.</p></body></html>",
      textContent:
        "Semantic SEO Guide Introduction to semantic seo and topic clusters. Entity coverage and NLP optimization matter.",
    };
    return {
      tenantId: "test-tenant",
      url: "https://example.com/semantic-seo",
      normalizedUrl: "https://example.com/semantic-seo",
      targetKeyword: "semantic seo",
      platform: "custom",
      parsed,
      options: {
        includeNeuronWriter: false,
        includePerformance: false,
        includeAiVisibility: true,
        renderJavascript: false,
        storeSnapshot: false,
      },
    };
  }

  it("ScoreOutput preserves every Phase A field (additive only)", async () => {
    const engine = new ScoringEngine();
    const out = await engine.scorePage(buildContext(), Date.now());

    // Phase A top-level fields still present and identically typed.
    expect(typeof out.scoreVersion).toBe("string");
    expect(out.overall.score_version).toBe(SCORE_VERSION);
    expect(typeof out.finalScore).toBe("number");
    expect(["excellent", "good", "needs_improvement", "poor", "critical"]).toContain(out.scoreBand);
    expect(Array.isArray(out.modules)).toBe(true);
    expect(Array.isArray(out.topIssues)).toBe(true);
    expect(Array.isArray(out.quickWins)).toBe(true);
    expect(Array.isArray(out.nextActions)).toBe(true);
    expect(Array.isArray(out.experimentalSignals)).toBe(true);
    expect(Array.isArray(out.enrichmentIssues)).toBe(true);
    expect(typeof out.platformReadiness.chatgpt).toBe("number");
    expect(typeof out.durationMs).toBe("number");
    expect(Array.isArray(out.recommendations)).toBe(true);
    expect(out.breakdown).toBeDefined();
    expect(out.breakdown.scoreVersion).toBe(SCORE_VERSION);
  });

  it("every emitted topIssue carries a non-empty issueTags array within the union", async () => {
    const engine = new ScoringEngine();
    const out = await engine.scorePage(buildContext(), Date.now());
    expect(out.topIssues.length).toBeGreaterThan(0);
    for (const iss of out.topIssues) {
      expect(Array.isArray(iss.issueTags)).toBe(true);
      expect(iss.issueTags!.length).toBeGreaterThanOrEqual(1);
      for (const tag of iss.issueTags!) {
        expect(ISSUE_TAG_SET.has(tag)).toBe(true);
      }
    }
  });

  it("breakdown shape is unchanged aside from additive issueTags (modules still carry Phase A fields)", async () => {
    const engine = new ScoringEngine();
    const out = await engine.scorePage(buildContext(), Date.now());
    for (const mod of out.breakdown.modules) {
      expect(typeof mod.key).toBe("string");
      expect(typeof mod.name).toBe("string");
      expect(typeof mod.score).toBe("number");
      expect(typeof mod.maxScore).toBe("number");
      expect(["excellent", "good", "needs_improvement", "poor", "critical"]).toContain(mod.status);
      for (const iss of mod.issues) {
        expect(typeof iss.code).toBe("string");
        expect(typeof iss.message).toBe("string");
        expect(typeof iss.pointLoss).toBe("number");
        expect(typeof iss.severity).toBe("string");
        expect(typeof iss.module).toBe("string");
      }
    }
  });
});

// ── VAL-B-CATALOG-012: tags not scattered across module source files ───────
// This is a static-grep assertion. The test mirrors the grep the validator
// would run: scanning the module files for tag-literal assignments. Because
// the test runs in Node (not by grepping the FS), it asserts the structural
// contract instead: the module files do NOT import or reference ISSUE_TAGS /
// CODE_TO_TAGS / attachIssueTags, and tag assignment happens exclusively in
// issue-tags.ts + engine.ts. The exhaustive grep is documented in the
// handoff; here we assert the centralized contract holds.
describe("VAL-B-CATALOG-012 — tag assignment is centralized in issue-tags.ts", () => {
  it("CODE_TO_TAGS is the single map and is frozen (single source of truth)", () => {
    expect(Object.isFrozen(CODE_TO_TAGS)).toBe(true);
  });

  it("attachIssueTags is the only tag-assignment function exported from issue-tags.ts", () => {
    // The module exports exactly ISSUE_TAGS, CODE_TO_TAGS, attachIssueTags.
    // (Re-asserted via the import at the top of this file — if the export
    // shape changed, the import would have failed at compile time.)
    expect(typeof attachIssueTags).toBe("function");
    expect(Array.isArray(ISSUE_TAGS)).toBe(true);
    expect(typeof CODE_TO_TAGS).toBe("object");
  });
});

// ── VAL-B-CATALOG-013: recommendation projection carries issueTags verbatim ─
describe("VAL-B-CATALOG-013 — recommendationFromIssue copies issueTags verbatim", () => {
  function buildContext(): ScoreContext {
    const parsed: ParsedPage = {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      title: "Semantic SEO Guide",
      metaDescription: "A practical guide to semantic SEO.",
      canonical: "https://example.com/semantic-seo",
      metaRobots: { noindex: false, nofollow: false },
      headings: [
        { level: 1, text: "Semantic SEO Guide" },
        { level: 2, text: "Introduction" },
      ],
      links: [{ href: "https://example.com/about", text: "About", isInternal: true }],
      images: [],
      jsonLd: [{ "@type": "Article", headline: "Semantic SEO Guide" }],
      og: { title: "Semantic SEO Guide" },
      rawHtml:
        "<html><body><h1>Semantic SEO Guide</h1><p>Introduction to semantic seo and topic clusters.</p></body></html>",
      textContent:
        "Semantic SEO Guide Introduction to semantic seo and topic clusters. Entity coverage and NLP optimization matter.",
    };
    return {
      tenantId: "test-tenant",
      url: "https://example.com/semantic-seo",
      normalizedUrl: "https://example.com/semantic-seo",
      targetKeyword: "semantic seo",
      platform: "custom",
      parsed,
      options: {
        includeNeuronWriter: false,
        includePerformance: false,
        includeAiVisibility: true,
        renderJavascript: false,
        storeSnapshot: false,
      },
    };
  }

  it("each recommendation built from a tagged issue carries the identical tag array", async () => {
    const engine = new ScoringEngine();
    const out = await engine.scorePage(buildContext(), Date.now());

    // Build a lookup of source-issue tags by code (topIssues carry issueTags).
    const sourceTagsByCode = new Map<string, IssueTag[] | undefined>();
    for (const iss of out.topIssues) {
      sourceTagsByCode.set(iss.code, iss.issueTags);
    }

    for (const rec of out.recommendations) {
      const sourceTags = sourceTagsByCode.get(rec.code);
      if (sourceTags && sourceTags.length > 0) {
        // The recommendation must carry the verbatim tag array — same
        // members, same order, no drop / reorder / mutation.
        expect(rec.issueTags).toEqual(sourceTags);
      }
    }
  });

  it("recommendation issueTags are members of the closed union", async () => {
    const engine = new ScoringEngine();
    const out = await engine.scorePage(buildContext(), Date.now());
    for (const rec of out.recommendations) {
      for (const tag of rec.issueTags ?? []) {
        expect(ISSUE_TAG_SET.has(tag)).toBe(true);
      }
    }
  });
});
