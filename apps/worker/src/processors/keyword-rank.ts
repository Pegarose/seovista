import {
  extractKeywordRank,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";

/**
 * Keyword rank result payload — the shape persisted in `job_results.payload`
 * with `result_type 'keyword-rank:result'` and rendered by the result page.
 *
 * There is intentionally NO score field: the keyword rank checker reports an
 * observed position snapshot, and an invented score would violate the
 * never-fabricate-metrics rule. The `dataSource` label is mandatory so the UI
 * can always state whether the entries came from a live SearXNG query or the
 * deterministic mock.
 */
export interface KeywordRankResultPayload {
  kind: "keyword-rank";
  domain: string;
  keyword: string;
  locale: SerpLocale;
  /** 1-based position of the target domain in the top 10, or null if absent. */
  position: number | null;
  top10: ReadonlyArray<SerpEntry & { isTarget: boolean }>;
  /** Number of SERP entries the provider returned (after the top-10 cap). */
  resultsReturned: number;
  /** ISO-8601 timestamp of when the check ran. */
  checkedAt: string;
  dataSource: "searxng" | "mock";
}

export interface ProcessKeywordRankPayloadInput {
  domain: string;
  keyword: string;
  locale: SerpLocale;
  /** Provider-returned entries (already parsed and capped to the top 10). */
  entries: SerpEntry[];
  dataSource: "searxng" | "mock";
}

export function processKeywordRankPayload(
  input: ProcessKeywordRankPayloadInput,
): KeywordRankResultPayload {
  const { position, top10 } = extractKeywordRank({
    domain: input.domain,
    entries: input.entries,
  });

  return {
    kind: "keyword-rank",
    domain: input.domain,
    keyword: input.keyword,
    locale: input.locale,
    position,
    top10,
    resultsReturned: input.entries.length,
    checkedAt: new Date().toISOString(),
    dataSource: input.dataSource,
  };
}
