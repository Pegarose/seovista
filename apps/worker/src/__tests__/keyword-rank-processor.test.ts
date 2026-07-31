import { describe, expect, it } from "vitest";
import { processKeywordRankPayload } from "../processors/keyword-rank";
import { parseSerpEntries } from "@seovista/seo-core";

describe("processKeywordRankPayload", () => {
  const entries = parseSerpEntries({
    results: [
      { url: "https://rival.com/a", title: "Rival", content: "r" },
      { url: "https://example.com/b", title: "Mine", content: "m" },
    ],
  });
  it("builds the persisted payload without a score", () => {
    const payload = processKeywordRankPayload({
      domain: "example.com", keyword: "seo denetimi", locale: "tr-TR",
      entries, dataSource: "mock",
    });
    expect(payload.kind).toBe("keyword-rank");
    expect(payload.position).toBe(2);
    expect(payload.top10).toHaveLength(2);
    expect(payload.resultsReturned).toBe(2);
    expect(payload.dataSource).toBe("mock");
    expect(typeof payload.checkedAt).toBe("string");
    expect(payload).not.toHaveProperty("score");
  });
});
