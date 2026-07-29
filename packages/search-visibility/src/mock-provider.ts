/**
 * Deterministic mock SearchVisibilityProvider.
 *
 * Produces reproducible keyword search results from a built-in fixture table.
 * Never contacts any external service. Missing, unknown, or unranked keywords
 * receive a consistent, truthful empty/no-results outcome.
 *
 * This is the default provider when SEOVISTA_SEARCH_PROVIDER_MODE is
 * missing, empty, or explicitly set to "mock".
 */

import type { SerpFeature } from "./types.js";
import type {
  ProviderSearchRequest,
  ProviderSearchResult,
  ProviderRankedResult,
  SearchVisibilityProvider,
} from "./provider.js";

// ── Deterministic fixture table ──────────────────────────────────────────
// Each entry maps a normalized keyword → a ranked result shape.
// Keywords not in this table return an empty (no_results) outcome.

interface MockFixtureEntry {
  position: number;
  volume: number;
  features: SerpFeature[];
}

const MOCK_FIXTURES: Record<string, MockFixtureEntry> = {
  "seo audit": {
    position: 3,
    volume: 1200,
    features: ["featured_snippet", "knowledge_panel"],
  },
  "seo tools": {
    position: 5,
    volume: 880,
    features: ["people_also_ask"],
  },
  "keyword research": {
    position: 2,
    volume: 2400,
    features: ["featured_snippet", "people_also_ask", "video_carousel"],
  },
  "geo optimization": {
    position: 1,
    volume: 3200,
    features: ["featured_snippet", "knowledge_panel", "image_pack"],
  },
  "content intelligence": {
    position: 7,
    volume: 650,
    features: [],
  },
  "serp rank tracking": {
    position: 4,
    volume: 1500,
    features: ["local_pack"],
  },
  "zero volume term": {
    position: 10,
    volume: 0,
    features: [],
  },
  "unranked term": {
    position: 0, // will be mapped to null (unranked)
    volume: 300,
    features: [],
  },
};

// ── Private helpers ──────────────────────────────────────────────────────

function normalizeFixtureKeyword(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildRankedResult(
  fixture: MockFixtureEntry,
): ProviderRankedResult {
  const position: number | null = fixture.position > 0 ? fixture.position : null;
  return {
    position,
    volume: fixture.volume,
    volumeStatus: fixture.volume === 0 ? "available" : "available",
    features: fixture.features,
    hasResults: fixture.position > 0,
  };
}

function buildEmptyResult(): ProviderRankedResult {
  return {
    position: null,
    volume: null,
    volumeStatus: "unknown",
    features: [],
    hasResults: false,
  };
}

// ── Public factory ───────────────────────────────────────────────────────

/**
 * Create a deterministic mock implementation of SearchVisibilityProvider.
 *
 * The mock resolves every keyword against an internal fixture table.
 * Fixture keywords return predictable positions, volumes, and features.
 * Unknown keywords return a truthful empty result (never rank 0, never
 * fabricated data). The mock never makes an external network request.
 */
export function createMockSearchVisibilityProvider(): SearchVisibilityProvider {
  return {
    providerId: "mock",

    async search(
      request: ProviderSearchRequest,
    ): Promise<ProviderSearchResult> {
      const normalized = normalizeFixtureKeyword(request.keyword);
      const fixture = MOCK_FIXTURES[normalized];

      const result: ProviderRankedResult = fixture
        ? buildRankedResult(fixture)
        : buildEmptyResult();

      return {
        keyword: request.keyword,
        results: [result],
        hasResults: result.hasResults,
        provider: "mock",
        fixtureId: request.context.fixtureId ?? `mock-${normalized}`,
        capturedAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
        context: request.context,
      };
    },
  };
}
