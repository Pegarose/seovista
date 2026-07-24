import { describe, it, expect, vi } from "vitest";
import {
  matchServices,
} from "../recommendation-matcher.js";
import type { AuditIssue } from "../types.js";
import type { CrewService } from "../catalog/index.js";
import { loadCrewCatalog } from "../catalog/index.js";

/**
 * Helper to build an AuditIssue with sensible defaults.
 */
function makeIssue(overrides: Partial<AuditIssue> & { code: string }): AuditIssue {
  const issue: AuditIssue = {
    title: `Issue ${overrides.code}`,
    severity: "high",
    module: "test-module",
    impact: "Test impact",
    evidence: null,
    recommendation: "Test recommendation",
    confidence: 1.0,
    ...overrides,
  };
  return issue;
}

/**
 * Helper to build a CrewService with sensible defaults.
 */
function makeService(overrides: Partial<CrewService> & { service_id: string }): CrewService {
  return {
    name: `Service ${overrides.service_id}`,
    description: `Description for ${overrides.service_id}`,
    target_issue_tags: ["schema"],
    tier: "pro",
    sla: "3 gün",
    ...overrides,
  };
}

describe("recommendation-matcher (VAL-B-REC-001..011)", () => {
  const crewCatalogFixture = loadCrewCatalog();

  // ── VAL-B-REC-001: Deterministic output order ─────────────────────────────────
  describe("VAL-B-REC-001: Deterministic output order", () => {
    it("returns strictly equal output over 100 repeated calls with frozen inputs", () => {
      const fixtureIssues: AuditIssue[] = Object.freeze([
        makeIssue({ code: "JSON_LD_INVALID", issueTags: ["schema"], pointLoss: -5 }),
        makeIssue({ code: "THIN_CONTENT_RISK", issueTags: ["content-depth"], pointLoss: -8 }),
        makeIssue({ code: "HTTP_5XX_DETECTED", issueTags: ["indexability"], severity: "critical" }),
      ]) as readonly AuditIssue[] as AuditIssue[];

      const fixtureCatalog: CrewService[] = Object.freeze([
        makeService({ service_id: "svc-a", target_issue_tags: ["schema", "content-depth"] }),
        makeService({ service_id: "svc-b", target_issue_tags: ["indexability"] }),
        makeService({ service_id: "svc-c", target_issue_tags: ["citations"] }),
      ]) as readonly CrewService[] as CrewService[];

      const first = matchServices(fixtureIssues, fixtureCatalog);
      expect(first.length).toBeGreaterThan(0);

      for (let i = 0; i < 100; i++) {
        expect(matchServices(fixtureIssues, fixtureCatalog)).toStrictEqual(first);
      }
    });
  });

  // ── VAL-B-REC-002: Empty issues yield empty result ───────────────────────────
  describe("VAL-B-REC-002: Empty issues yield empty result", () => {
    it("returns [] when issues array is empty regardless of catalog", () => {
      expect(matchServices([], crewCatalogFixture)).toEqual([]);
      expect(matchServices([], [])).toEqual([]);
    });
  });

  // ── VAL-B-REC-003: Issues with no overlapping target tags are excluded ────────
  describe("VAL-B-REC-003: Disjoint issueTags yield no contribution/emission", () => {
    it("returns [] when issueTags and target_issue_tags have no overlap", () => {
      const issue = makeIssue({ code: "THIN_CONTENT_RISK", issueTags: ["content-depth"], pointLoss: -10 });
      const service = makeService({ service_id: "schema-pack", target_issue_tags: ["schema"] });

      expect(matchServices([issue], [service])).toEqual([]);
    });
  });

  // ── VAL-B-REC-004: Relevance score aggregates pointLoss for intersecting tags ──
  describe("VAL-B-REC-004: Relevance score aggregates abs(pointLoss) for intersecting tags", () => {
    it("aggregates abs(pointLoss) of intersecting issues and counts each matching issue once per service", () => {
      const service = makeService({ service_id: "schema-service", target_issue_tags: ["schema", "entity-clarity"] });
      // Issue A: matches "schema" (-5)
      const issueA = makeIssue({ code: "ISSUE_A", issueTags: ["schema"], pointLoss: -5 });
      // Issue B: matches both "schema" and "entity-clarity" (-3), should contribute 3 (not 6)
      const issueB = makeIssue({ code: "ISSUE_B", issueTags: ["schema", "entity-clarity"], pointLoss: -3 });
      // Issue C: disjoint tag ("internal-linking") (-2), should NOT contribute
      const issueC = makeIssue({ code: "ISSUE_C", issueTags: ["internal-linking"], pointLoss: -2 });

      const matches = matchServices([issueA, issueB, issueC], [service]);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.relevanceScore).toBe(8); // abs(-5) + abs(-3) = 8
    });
  });

  // ── VAL-B-REC-005: Severity weight fallback when pointLoss is absent ────────
  describe("VAL-B-REC-005: Severity weight fallback when pointLoss is absent", () => {
    it("strictly orders severity weights: critical > high > medium > low > info (all > 0)", () => {
      const service = makeService({ service_id: "general-svc", target_issue_tags: ["schema"] });

      const severities = ["critical", "high", "medium", "low", "info"] as const;
      const scores: number[] = [];

      for (const sev of severities) {
        const issue = makeIssue({ code: `ISSUE_${sev}`, issueTags: ["schema"], severity: sev });
        const res = matchServices([issue], [service]);
        expect(res).toHaveLength(1);
        expect(res[0]!.relevanceScore).toBeGreaterThan(0);
        scores.push(res[0]!.relevanceScore);
      }

      // Assert strictly decreasing ordering
      for (let i = 0; i < scores.length - 1; i++) {
        expect(scores[i]!).toBeGreaterThan(scores[i + 1]!);
      }
    });

    it("falls back to severity weight when pointLoss is 0 or undefined", () => {
      const service = makeService({ service_id: "svc", target_issue_tags: ["schema"] });
      const issueWith0 = makeIssue({ code: "I1", issueTags: ["schema"], severity: "high", pointLoss: 0 });
      const issueWithUndef = makeIssue({ code: "I2", issueTags: ["schema"], severity: "high" });

      const res0 = matchServices([issueWith0], [service]);
      const resUndef = matchServices([issueWithUndef], [service]);

      expect(res0[0]!.relevanceScore).toBeGreaterThan(0);
      expect(resUndef[0]!.relevanceScore).toBeGreaterThan(0);
      expect(res0[0]!.relevanceScore).toBe(resUndef[0]!.relevanceScore);
    });
  });

  // ── VAL-B-REC-006: Only services with positive relevanceScore are returned ──
  describe("VAL-B-REC-006: Only services with relevanceScore > 0 returned", () => {
    it("excludes services with relevanceScore 0", () => {
      const matchingService = makeService({ service_id: "svc-match", target_issue_tags: ["schema"] });
      const nonMatchingService = makeService({ service_id: "svc-no-match", target_issue_tags: ["citations"] });

      const issue = makeIssue({ code: "SCHEMA_ISSUE", issueTags: ["schema"], pointLoss: -10 });

      const results = matchServices([issue], [matchingService, nonMatchingService]);
      expect(results).toHaveLength(1);
      expect(results[0]!.service_id).toBe("svc-match");
      expect(results[0]!.relevanceScore).toBe(10);
    });
  });

  // ── VAL-B-REC-007: Descending relevance score ranking with service_id tie-break ──
  describe("VAL-B-REC-007: Descending relevance score ranking with service_id asc tie-break", () => {
    it("sorts by relevanceScore desc, tie-broken by service_id asc (stable)", () => {
      const svcA = makeService({ service_id: "geo-a", target_issue_tags: ["schema"] }); // score 10
      const svcB = makeService({ service_id: "geo-b", target_issue_tags: ["schema", "citations"] }); // score 20
      const svcC = makeService({ service_id: "geo-c", target_issue_tags: ["schema", "citations"] }); // score 20

      const issue1 = makeIssue({ code: "SCHEMA_I", issueTags: ["schema"], pointLoss: -10 });
      const issue2 = makeIssue({ code: "CIT_I", issueTags: ["citations"], pointLoss: -10 });

      const results = matchServices([issue1, issue2], [svcA, svcB, svcC]);
      expect(results.map((r) => r.service_id)).toEqual(["geo-b", "geo-c", "geo-a"]);
    });
  });

  // ── VAL-B-REC-008: matchedTags and addressedIssueCodes correctly populated ─
  describe("VAL-B-REC-008: matchedTags and addressedIssueCodes correctly populated", () => {
    it("populates distinct matchedTags and deduped input-order stable addressedIssueCodes", () => {
      const service = makeService({
        service_id: "svc-complex",
        target_issue_tags: ["schema", "entity-clarity"],
      });

      const issue1 = makeIssue({ code: "SCHEMA_MISSING", issueTags: ["schema"], pointLoss: -5 });
      const issue2 = makeIssue({ code: "ENTITY_WEAK", issueTags: ["entity-clarity"], pointLoss: -3 });
      const issue3 = makeIssue({ code: "LINKS_LOW", issueTags: ["internal-linking"], pointLoss: -2 });
      const issue4 = makeIssue({ code: "SCHEMA_MISSING", issueTags: ["schema", "entity-clarity"], pointLoss: -1 });

      const results = matchServices([issue1, issue2, issue3, issue4], [service]);
      expect(results).toHaveLength(1);
      const res = results[0]!;

      // matchedTags: intersecting distinct target tags, no non-target or duplicates
      expect(res.matchedTags).toEqual(["schema", "entity-clarity"]);

      // addressedIssueCodes: contributing issue codes, deduped, input-order stable
      expect(res.addressedIssueCodes).toEqual(["SCHEMA_MISSING", "ENTITY_WEAK"]);
    });
  });

  // ── VAL-B-REC-009: Purity — no side effects, I/O, or network access ─────────
  describe("VAL-B-REC-009: Pure function — no I/O, network, env reads, console, or input mutation", () => {
    it("leaves inputs unmutated, triggers no I/O, and returns a new reference", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const consoleLogSpy = vi.spyOn(console, "log");

      const rawIssues: AuditIssue[] = [
        makeIssue({ code: "I1", issueTags: ["schema"], pointLoss: -5 }),
        makeIssue({ code: "I2", issueTags: ["content-depth"], pointLoss: -10 }),
      ];
      const rawCatalog: CrewService[] = [
        makeService({ service_id: "svc-1", target_issue_tags: ["schema"] }),
      ];

      const clonedIssues = structuredClone(rawIssues);
      const clonedCatalog = structuredClone(rawCatalog);

      const result = matchServices(rawIssues, rawCatalog);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(rawIssues).toEqual(clonedIssues);
      expect(rawCatalog).toEqual(clonedCatalog);
      expect(result).not.toBe(rawCatalog);
      expect(result).not.toBe(rawIssues);

      fetchSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  // ── VAL-B-REC-010: Empty or absent issueTags yield no contribution ───────────
  describe("VAL-B-REC-010: Issues with empty or absent issueTags do not contribute", () => {
    it("ignores issues with empty, undefined, or missing issueTags", () => {
      const emptyTagIssue = makeIssue({ code: "EMPTY_TAGS", issueTags: [], pointLoss: -100 });
      const undefTagIssue = makeIssue({ code: "UNDEF_TAGS", pointLoss: -100 });

      expect(matchServices([emptyTagIssue], crewCatalogFixture)).toEqual([]);
      expect(matchServices([undefTagIssue], crewCatalogFixture)).toEqual([]);

      const validIssue1 = makeIssue({ code: "VALID1", issueTags: ["schema"], pointLoss: -5 });
      const validIssue2 = makeIssue({ code: "VALID2", issueTags: ["content-depth"], pointLoss: -10 });

      const baseResult = matchServices([validIssue1, validIssue2], crewCatalogFixture);
      const resultWithEmpty = matchServices(
        [validIssue1, emptyTagIssue, validIssue2, undefTagIssue],
        crewCatalogFixture,
      );

      expect(resultWithEmpty).toStrictEqual(baseResult);
    });
  });

  // ── VAL-B-REC-011: No silent maximum cap on returned services ───────────────
  describe("VAL-B-REC-011: No hidden top-N cap on returned services", () => {
    it("returns all catalog services with relevanceScore > 0 without truncation", () => {
      const count = 25;
      const catalog: CrewService[] = [];
      for (let i = 0; i < count; i++) {
        catalog.push(makeService({ service_id: `svc-${String(i).padStart(2, "0")}`, target_issue_tags: ["schema"] }));
      }

      const issue = makeIssue({ code: "SCHEMA_ISSUE", issueTags: ["schema"], pointLoss: -5 });

      const results = matchServices([issue], catalog);
      expect(results).toHaveLength(25);
    });
  });
});
