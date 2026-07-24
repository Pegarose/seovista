import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { InternalAxiosRequestConfig } from "axios";
import { ScoringEngine } from "../engine.js";
import { buildDryRunContext } from "../dry-run.js";
import { nwClient } from "../providers/neuronwriter.js";
import type { ParsedPage, ScoreContext } from "../types.js";

/**
 * Variance CI suite — `VAL-A-VAR-002` / `VAL-A-VAR-003`.
 *
 * Loads every `ParsedPage` fixture under `tests/fixtures/parsed_pages/` via
 * `fs.readFileSync` + `JSON.parse` (NEVER re-fetched), runs
 * `ScoringEngine.scorePage` N=5 times per fixture on the offline deterministic
 * core, and asserts `max(scores) − min(scores) ≤ 2` per fixture. This is the
 * Phase A release gate.
 *
 * Each fixture file is a JSON document of shape:
 *   {
 *     "metadata": {
 *       "sourceUrl": string,
 *       "canonicalUrl": string,
 *       "sourceDate": string,        // ISO date the fixture was captured
 *       "captureMethod": string,     // how the HTML/ParsedPage was produced
 *       "category": string,          // static | spa-rich | large-text | ...
 *       "description": string
 *     },
 *     "parsedPage": ParsedPage
 *   }
 *
 * The metadata is surfaced in the per-fixture test output (capture date +
 * canonicalized source URL) per the VAL-A-VAR-002 evidence requirement, and
 * the assertion message follows the `fixture=<name> max=<m> min=<n>
 * diff=<d<=2>` format required by VAL-A-VAR-003.
 */

const RUNS = 5;
const THRESHOLD = 2;

/**
 * Absolute path to the parsed_pages fixtures directory at the repo root.
 *
 * `import.meta.dirname` is `packages/geo-engine/src/__tests__`; walking up
 * four levels reaches the repo root, then `tests/fixtures/parsed_pages`.
 */
const FIXTURES_DIR = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "parsed_pages",
);

interface FixtureMetadata {
  sourceUrl: string;
  canonicalUrl: string;
  sourceDate: string;
  captureMethod: string;
  category: string;
  description: string;
}

interface FixtureFile {
  name: string;
  path: string;
  metadata: FixtureMetadata;
  parsedPage: ParsedPage;
}

/**
 * Discover and load every `*.json` fixture in the parsed_pages directory.
 * Filenames (minus `.json`) become the fixture identity surfaced in
 * assertion messages. Loading is synchronous (fs.readFileSync + JSON.parse)
 * so the suite never re-fetches over the network.
 */
function loadFixtures(): FixtureFile[] {
  const entries = readdirSync(FIXTURES_DIR).sort();
  const fixtures: FixtureFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const path = join(FIXTURES_DIR, entry);
    if (!statSync(path).isFile()) continue;
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as {
      metadata?: FixtureMetadata;
      parsedPage?: ParsedPage;
    };
    if (!parsed.parsedPage) {
      throw new Error(`Fixture ${path} is missing the "parsedPage" field`);
    }
    if (!parsed.metadata) {
      throw new Error(`Fixture ${path} is missing the "metadata" field`);
    }
    fixtures.push({
      name: entry.replace(/\.json$/, ""),
      path,
      metadata: parsed.metadata,
      parsedPage: parsed.parsedPage,
    });
  }
  return fixtures;
}

const FIXTURES = loadFixtures();

/**
 * Required coverage per VAL-A-VAR-002: at minimum a static HTML fixture, an
 * SPA-rich fixture, and a large-text fixture. The fixture set must include
 * all three; this guard fails the suite early (with a clear message) if a
 * required category is missing rather than silently passing an incomplete
 * suite.
 */
const REQUIRED_CATEGORIES: Record<string, RegExp> = {
  static: /example\.com/i,
  "spa-rich": /react\.dev/i,
  "large-text": /wikipedia\.org/i,
};

describe("variance CI suite — VAL-A-VAR-002 / VAL-A-VAR-003", () => {
  // Tripwire: if any code path reaches NeuronWriter's axios instance during
  // the variance runs, this adapter throws immediately. The variance suite
  // must never make an outbound HTTP request — it scores pre-built fixtures
  // on the deterministic offline core.
  const originalAdapter = nwClient.defaults.adapter;

  beforeEach(() => {
    nwClient.defaults.adapter = async (_config: InternalAxiosRequestConfig) => {
      throw new Error("Variance CI suite must not make outbound HTTP requests");
    };
  });

  afterEach(() => {
    nwClient.defaults.adapter = originalAdapter as NonNullable<
      typeof nwClient.defaults.adapter
    >;
  });

  it("discovered the parsed_pages fixtures directory and at least 3 fixtures", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(3);
  });

  it("includes the required fixture coverage (static, spa-rich, large-text)", () => {
    for (const [category, pattern] of Object.entries(REQUIRED_CATEGORIES)) {
      const present = FIXTURES.some(
        (f) => pattern.test(f.name) || pattern.test(f.metadata.canonicalUrl),
      );
      expect(present, `missing required fixture coverage category: ${category}`).toBe(true);
    }
  });

  it("every fixture documents source date, canonical URL, and capture method", () => {
    for (const f of FIXTURES) {
      expect(f.metadata.sourceDate.length).toBeGreaterThan(0);
      expect(f.metadata.canonicalUrl.length).toBeGreaterThan(0);
      expect(f.metadata.captureMethod.length).toBeGreaterThan(0);
      expect(f.metadata.sourceUrl.length).toBeGreaterThan(0);
    }
  });

  describe.each(FIXTURES)("fixture=$name", (fixture) => {
    it(`runs scorePage ${RUNS}× with max−min ≤ ${THRESHOLD} (category=${fixture.metadata.category}, sourceDate=${fixture.metadata.sourceDate}, canonical=${fixture.metadata.canonicalUrl})`, async () => {
      const engine = new ScoringEngine();
      // Offline deterministic context: every network-gated option is off, so
      // the score is derived purely from the captured `ParsedPage`. The same
      // fixture produces the same score byte-for-byte across runs.
      const ctx: ScoreContext = buildDryRunContext(fixture.parsedPage, {
        url: fixture.metadata.canonicalUrl,
      });
      expect(ctx.options?.includeNeuronWriter).toBe(false);

      const scores: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const out = await engine.scorePage(ctx, 0);
        expect(out.overall.score).toBeGreaterThanOrEqual(0);
        expect(out.overall.score).toBeLessThanOrEqual(100);
        scores.push(out.overall.score);
      }

      const max = Math.max(...scores);
      const min = Math.min(...scores);
      const diff = max - min;

      // Surface every run's score + the variance summary so the test report
      // is self-explanatory. The assertion message follows the
      // `fixture=<name> max=<m> min=<n> diff=<d<=2>` format required by
      // VAL-A-VAR-003 so a failure points directly at the offending fixture.
      const summary =
        `fixture=${fixture.name} max=${max} min=${min} diff=${diff}` +
        ` (threshold=${THRESHOLD}, runs=${JSON.stringify(scores)}, ` +
        `category=${fixture.metadata.category}, ` +
        `source=${fixture.metadata.canonicalUrl}, ` +
        `sourceDate=${fixture.metadata.sourceDate}, ` +
        `captureMethod=${fixture.metadata.captureMethod})`;

      // Asserted, not just observed. The `summary` is the failure message, so
      // a threshold breach exits 1 and surfaces the offending fixture
      // identity + observed variance as the first line of the failure output.
      expect(diff, summary).toBeLessThanOrEqual(THRESHOLD);
    });
  });
});
