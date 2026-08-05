import { describe, expect, it } from "vitest";
import {
  splitClaims,
  tokenise,
  traceAttribution,
  type SourceDocument,
} from "../attribution-trace";

const SELFPAGE_TEXT = [
  "example.com is one of the largest Turkish e-commerce sites.",
  "Its platform serves more than 100 categories including electronics and fashion.",
  "Founded in 2000, headquartered in Istanbul, thousands of employees.",
].join("\n");

const SERP_SOURCES: readonly SourceDocument[] = [
  {
    id: "serp:1",
    label: "result 1",
    kind: "external",
    url: "https://rival-a.com/article",
    text: "The Turkish online marketplaces aggregate consumer electronics through Dec 2024 revenue streams.",
  },
  {
    id: "serp:2",
    label: "result 2",
    kind: "external",
    url: "https://rival-b.com/blog",
    text: "Sustainable packaging initiatives across Turkish online retailers are on the rise.",
  },
];

describe("tokenise", () => {
  it("lowercases, strips diacritics and keeps words of length >= 3", () => {
    const t = tokenise("İstanbul TAŞTI — A&B Apps");
    expect(t.has("istanbul")).toBe(true);
    expect(t.has("tasti")).toBe(true);
    expect(t.has("apps")).toBe(true);
    expect(t.has("ab")).toBe(false);
    expect(t.has("a")).toBe(false);
  });
});

describe("splitClaims", () => {
  it("splits sentences and drops too-short / too-long fragments", () => {
    const claims = splitClaims(
      "Merhaba hoş geldiniz! Example.com sitesi 20 yıldır faaliyette. Sinirler bozuldu örnek bir açıklama. Lütfen deneyin.",
    );
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.split(/\s+/).length >= 4)).toBe(true);
  });
});

describe("traceAttribution", () => {
  it("classifies claims echoed by the site itself as self", () => {
    const result = traceAttribution(
      "Example.com sits at example.com, e-commerce serving more than 100 categories including electronics and fashion.",
      { selfLabel: "example.com", selfText: SELFPAGE_TEXT, selfUrl: "https://example.com/" },
    );
    expect(result.totalClaims).toBe(1);
    expect(result.selfClaims).toBe(1);
    expect(result.verdicts[0]?.kind).toBe("self");
  });

  it("classifies claims echoed by SERP entries as external", () => {
    const result = traceAttribution(
      "The Turkish online marketplaces aggregate consumer electronics through Dec 2024 revenue streams.",
      { selfLabel: "example.com", selfText: SELFPAGE_TEXT, selfUrl: "https://example.com/", serpSources: SERP_SOURCES },
    );
    expect(result.externalClaims).toBe(1);
    expect(result.verdicts[0]?.bestSourceId).toBe("serp:1");
  });

  it("flags claims that mention the site but cannot be sourced as misattributed", () => {
    const result = traceAttribution(
      "Example.com is the largest car retailer in Europe with 40k showrooms.",
      { selfLabel: "example.com", selfText: SELFPAGE_TEXT, selfUrl: "https://example.com/", serpSources: SERP_SOURCES },
    );
    expect(result.misattributedClaims).toBe(1);
    expect(result.verdicts[0]?.kind).toBe("misattributed");
  });

  it("returns 100 when the answer carries no detectable claims", () => {
    const result = traceAttribution("", {
      selfLabel: "example.com",
      selfText: SELFPAGE_TEXT,
      serpSources: SERP_SOURCES,
    });
    expect(result.totalClaims).toBe(0);
    expect(result.score).toBe(100);
  });

  it("classifies unfounded claims that do not mention the site as unverifiable", () => {
    const result = traceAttribution(
      "Quantum entanglement relates distant particles regardless of separation distance.",
      { selfLabel: "example.com", selfText: SELFPAGE_TEXT, serpSources: SERP_SOURCES },
    );
    expect(result.unverifiableClaims).toBe(1);
    expect(result.verdicts[0]?.kind).toBe("unverifiable");
  });
});
