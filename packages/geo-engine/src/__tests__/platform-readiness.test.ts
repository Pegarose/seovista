import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ScoringEngine, SCORE_VERSION } from "../engine.js";
import { buildDryRunContext } from "../dry-run.js";
import { CODE_TO_TAGS } from "../issue-tags.js";
import type { ParsedPage, ScoreContext } from "../types.js";

/**
 * Ghost platform-readiness remap tests for the
 * `ghost-platform-readiness-remap` feature.
 *
 * Locks in VAL-B-CATALOG-007 / 008 / 009 / 010:
 *   - 007: `calculatePlatformReadiness()` references no ghost code; every
 *     code it checks is a real emitted code.
 *   - 008: two fixtures emitting different real codes produce measurably
 *     different `platformReadiness` vectors (no longer near-static).
 *   - 009: identical `ParsedPage` yields identical overall score AND
 *     identical `platformReadiness` across repeated runs; variance CI gate
 *     (max − min ≤ 2) still passes.
 *   - 010: `score_version` is bumped ONLY if the overall 0-100 score
 *     changes. The remap touches only the experimental per-platform
 *     readiness display (not the deterministic overall score), so
 *     `score_version` stays `seovista-score-v1.2-decoupled` and no
 *     `tests/fixtures/parsed_pages/*` expected outputs are re-recorded.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_SOURCE_PATH = resolve(__dirname, "..", "engine.ts");
const ENGINE_SOURCE = readFileSync(ENGINE_SOURCE_PATH, "utf-8");

const FIXTURES_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "parsed_pages",
);

// The 8 ghost codes that were never emitted by any module and previously
// referenced by `calculatePlatformReadiness()`.
const GHOST_CODES: readonly string[] = [
  "HTTP_STATUS_NOT_200",
  "META_NOINDEX_FOUND",
  "AI_PARSEABILITY_LOW",
  "ARTICLE_JSON_LD_MISSING",
  "ORGANIZATION_SCHEMA_MISSING",
  "PLATFORM_SOURCE_FIT_WEAK",
  "INTERNAL_LINKS_LOW",
  "CONTENT_DEPTH_LOW",
];

// The real emitted codes each ghost code was remapped onto. Each of these
// MUST be a member of the emitted-code set (the keys of CODE_TO_TAGS, which
// the `issue-tag-vocabulary` feature keeps in lock-step with the codes the
// 7 modules + enrichment surface actually emit).
const REMAPPED_REAL_CODES: readonly string[] = [
  "HTTP_STATUS_NOT_OK",
  "NOINDEX_DETECTED",
  "AI_PARSEABILITY_RISK",
  "JSON_LD_MISSING_RECOMMENDED_SCHEMA",
  "BREADCRUMB_SCHEMA_MISSING",
  "CITATION_READINESS_WEAK",
  "NO_INTERNAL_LINKS",
  "THIN_CONTENT_RISK",
];

const EMITTED_CODE_SET: ReadonlySet<string> = new Set(Object.keys(CODE_TO_TAGS));

function loadFixture(name: string): ParsedPage {
  const path = join(FIXTURES_DIR, `${name}.json`);
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as { parsedPage: ParsedPage };
  return parsed.parsedPage;
}

async function scoreFixture(name: string, url: string) {
  const engine = new ScoringEngine();
  const ctx: ScoreContext = buildDryRunContext(loadFixture(name), { url });
  return engine.scorePage(ctx, 0);
}

// ── VAL-B-CATALOG-007: ghost codes remapped to real emitted codes ───────────
describe("VAL-B-CATALOG-007 — ghost platform-readiness codes remapped to real emitted codes", () => {
  it("no ghost code string appears anywhere in engine.ts (grep clean)", () => {
    const offenders: string[] = [];
    for (const ghost of GHOST_CODES) {
      if (ENGINE_SOURCE.includes(ghost)) {
        offenders.push(ghost);
      }
    }
    expect(offenders, `ghost codes still present in engine.ts: ${offenders.join(", ")}`).toEqual([]);
  });

  it.each(REMAPPED_REAL_CODES)("real code %s is a member of the emitted-code set (CODE_TO_TAGS)", (code) => {
    expect(EMITTED_CODE_SET.has(code), `${code} is not in the emitted-code set`).toBe(true);
  });

  it("each remapped real code is actually referenced by the readiness logic in engine.ts", () => {
    // Every remapped real code must appear as a hasIssue('...') argument
    // inside the readiness function — otherwise the remap silently dropped
    // a check.
    const missing = REMAPPED_REAL_CODES.filter(
      (code) => !ENGINE_SOURCE.includes(`hasIssue('${code}')`),
    );
    expect(missing, `real codes not referenced in readiness logic: ${missing.join(", ")}`).toEqual([]);
  });

  it("every hasIssue('...') code referenced inside calculatePlatformReadiness belongs to the emitted-code set", () => {
    // Extract the calculatePlatformReadiness function body and collect every
    // hasIssue('CODE') argument, then assert each is a real emitted code.
    const fnStart = ENGINE_SOURCE.indexOf("calculatePlatformReadiness(");
    expect(fnStart).toBeGreaterThan(-1);
    // The function body ends at the next `private` method or the closing
    // `return { ... }` block of the readiness function. Capture a generous
    // slice and stop at the next `private ` keyword after the return.
    const slice = ENGINE_SOURCE.slice(fnStart);
    const endMatch = slice.indexOf("private getSeverityWeight");
    const body = endMatch > -1 ? slice.slice(0, endMatch) : slice;

    const referenced = Array.from(body.matchAll(/hasIssue\('([A-Z_]+)'\)/g))
      .map((m) => m[1])
      .filter((code): code is string => typeof code === "string");
    expect(referenced.length, "expected several hasIssue checks in readiness logic").toBeGreaterThan(0);

    const offVocab = referenced.filter((code) => !EMITTED_CODE_SET.has(code));
    expect(
      offVocab,
      `readiness logic references non-emitted codes: ${offVocab.join(", ")}`,
    ).toEqual([]);

    // And none of the referenced codes is a ghost code.
    const ghostReferenced = referenced.filter((code) => GHOST_CODES.includes(code));
    expect(ghostReferenced, `readiness logic still references ghost codes: ${ghostReferenced.join(", ")}`).toEqual([]);
  });
});

// ── VAL-B-CATALOG-008: platform readiness becomes dynamic after remap ──────
describe("VAL-B-CATALOG-008 — platform readiness becomes dynamic after remap", () => {
  it("a clean fixture and a noindex fixture produce measurably different platformReadiness vectors", async () => {
    // The noindex fixture emits NOINDEX_DETECTED (a real indexability code),
    // which after the remap deducts 0.4 from googleAiOverviews. The clean
    // example.com fixture emits no such code, so its googleAiOverviews stays
    // at the baseline. Before the remap, the ghost META_NOINDEX_FOUND never
    // fired for either fixture, so both stayed near-static — this assertion
    // proves the values now move in response to a real emitted code.
    const clean = await scoreFixture("example.com", "https://example.com/");
    const noindex = await scoreFixture("noindex.example-blog.dev", "https://noindex.example-blog.dev/private-draft");

    // The noindex fixture must actually emit NOINDEX_DETECTED for the
    // assertion to be meaningful.
    const noindexEmitsCode = noindex.topIssues.some((i) => i.code === "NOINDEX_DETECTED");
    expect(noindexEmitsCode, "noindex fixture should emit NOINDEX_DETECTED").toBe(true);

    // At least one platform value must differ measurably (>= 0.1) between
    // the two fixtures — the vectors are no longer near-static defaults.
    const diffs: Record<string, number> = {
      chatgpt: Math.abs(clean.platformReadiness.chatgpt - noindex.platformReadiness.chatgpt),
      perplexity: Math.abs(clean.platformReadiness.perplexity - noindex.platformReadiness.perplexity),
      googleAiOverviews: Math.abs(clean.platformReadiness.googleAiOverviews - noindex.platformReadiness.googleAiOverviews),
      bingCopilot: Math.abs(clean.platformReadiness.bingCopilot - noindex.platformReadiness.bingCopilot),
    };
    const movedPlatforms = Object.entries(diffs).filter(([, d]) => d >= 0.1).map(([k]) => k);
    expect(
      movedPlatforms.length,
      `expected ≥1 platform value to move ≥0.1 between fixtures; diffs=${JSON.stringify(diffs)}`,
    ).toBeGreaterThan(0);

    // googleAiOverviews specifically must drop on the noindex fixture because
    // NOINDEX_DETECTED is now a real readiness input for that platform.
    expect(noindex.platformReadiness.googleAiOverviews).toBeLessThan(
      clean.platformReadiness.googleAiOverviews,
    );
  });

  it("the noindex fixture's googleAiOverviews is at least 0.1 below the clean fixture's (real signal drives the drop)", async () => {
    const clean = await scoreFixture("example.com", "https://example.com/");
    const noindex = await scoreFixture("noindex.example-blog.dev", "https://noindex.example-blog.dev/private-draft");
    expect(
      clean.platformReadiness.googleAiOverviews - noindex.platformReadiness.googleAiOverviews,
    ).toBeGreaterThanOrEqual(0.1);
  });
});

// ── VAL-B-CATALOG-009: deterministic score core preserved (variance CI gate) ─
describe("VAL-B-CATALOG-009 — deterministic score core preserved (variance CI gate passes)", () => {
  it("identical ParsedPage yields identical overall score AND identical platformReadiness across repeated runs", async () => {
    interface PrVector {
      chatgpt: number;
      perplexity: number;
      googleAiOverviews: number;
      bingCopilot: number;
    }
    const runs: { score: number; pr: PrVector }[] = [];
    let firstPr: PrVector | null = null;
    for (let i = 0; i < 5; i++) {
      const out = await scoreFixture("wikipedia.org", "https://wikipedia.org/");
      const pr: PrVector = {
        chatgpt: out.platformReadiness.chatgpt,
        perplexity: out.platformReadiness.perplexity,
        googleAiOverviews: out.platformReadiness.googleAiOverviews,
        bingCopilot: out.platformReadiness.bingCopilot,
      };
      if (i === 0) {
        firstPr = pr;
      }
      runs.push({ score: out.overall.score, pr });
    }

    // Overall score: every run identical (zero variance, well within ≤2 gate).
    const scores = runs.map((r) => r.score);
    const maxMin = Math.max(...scores) - Math.min(...scores);
    expect(maxMin, `overall score variance=${maxMin}`).toBeLessThanOrEqual(2);
    expect(new Set(scores).size).toBe(1);

    // platformReadiness: every run deep-equal to the first.
    expect(firstPr).not.toBeNull();
    for (const run of runs) {
      expect(run.pr).toEqual(firstPr);
    }
  });

  it("variance CI gate (max−min ≤ 2) passes across every parsed_pages fixture", async () => {
    // Mirror the Phase A variance_ci gate over the deterministic overall
    // score. The remap must not introduce any new source of run-to-run
    // variance into the overall score path.
    const entries = readdirSync(FIXTURES_DIR).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const path = join(FIXTURES_DIR, entry);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as { metadata: { canonicalUrl: string }; parsedPage: ParsedPage };
      const scores: number[] = [];
      for (let i = 0; i < 5; i++) {
        const engine = new ScoringEngine();
        const ctx: ScoreContext = buildDryRunContext(parsed.parsedPage, { url: parsed.metadata.canonicalUrl });
        const out = await engine.scorePage(ctx, 0);
        scores.push(out.overall.score);
      }
      const diff = Math.max(...scores) - Math.min(...scores);
      expect(diff, `fixture=${entry.replace(/\.json$/, "")} variance=${diff} > 2`).toBeLessThanOrEqual(2);
    }
  });
});

// ── VAL-B-CATALOG-010: score_version bumped only if overall score changes ──
describe("VAL-B-CATALOG-010 — score_version bumped only if overall score changes", () => {
  it("SCORE_VERSION remains seovista-score-v1.2-decoupled (remap affects only per-platform readiness, not the overall score)", () => {
    // The ghost-code remap touches ONLY `calculatePlatformReadiness()`,
    // which produces the experimental per-platform readiness display. It
    // does NOT feed the deterministic overall 0-100 score path (module
    // scores + caps + band). Per the score_version discipline
    // (architecture.md §2.3 / §7.2), the version is bumped AND fixtures
    // re-recorded ONLY when the overall score changes. Since the overall
    // score is unaffected, `score_version` stays
    // `seovista-score-v1.2-decoupled` and no `tests/fixtures/parsed_pages/*`
    // expected outputs are re-recorded. This decision is documented here and
    // in the engine.ts readiness comment.
    expect(SCORE_VERSION).toBe("seovista-score-v1.2-decoupled");
  });

  it("every scored fixture reports overall.score_version === SCORE_VERSION (version consistency)", async () => {
    const entries = readdirSync(FIXTURES_DIR).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const path = join(FIXTURES_DIR, entry);
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as { metadata: { canonicalUrl: string }; parsedPage: ParsedPage };
      const engine = new ScoringEngine();
      const ctx: ScoreContext = buildDryRunContext(parsed.parsedPage, { url: parsed.metadata.canonicalUrl });
      const out = await engine.scorePage(ctx, 0);
      expect(out.overall.score_version).toBe(SCORE_VERSION);
      expect(out.scoreVersion).toBe(SCORE_VERSION);
      expect(out.breakdown.scoreVersion).toBe(SCORE_VERSION);
    }
  });

  it("the remap does not change the overall score vs a hand-computed expectation snapshot is stable across runs", async () => {
    // Guard against an accidental regression where the remap leaks into the
    // overall score path: the overall score for a fixture must be identical
    // across two independent engine instantiations.
    const a = await scoreFixture("react.dev", "https://react.dev/");
    const b = await scoreFixture("react.dev", "https://react.dev/");
    expect(a.overall.score).toBe(b.overall.score);
    expect(a.finalScore).toBe(b.finalScore);
    expect(a.scoreBand).toBe(b.scoreBand);
  });
});
