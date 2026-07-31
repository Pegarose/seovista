import { describe, expect, it } from "vitest";
import {
  extractKeywordRank,
  isValidPublicDomain,
  matchesDomain,
  normalizeHost,
  parseSerpEntries,
  SERP_LOCALES,
} from "../serp-rank";

describe("normalizeHost", () => {
  it("strips scheme, path, port and www", () => {
    expect(normalizeHost("https://www.Example.COM:443/sayfa?q=1")).toBe("example.com");
  });
  it("accepts a bare host", () => {
    expect(normalizeHost("Example.com")).toBe("example.com");
  });
});

describe("matchesDomain", () => {
  it("matches exact host and subdomains, rejects lookalikes", () => {
    expect(matchesDomain("https://example.com/a", "example.com")).toBe(true);
    expect(matchesDomain("https://blog.example.com/", "example.com")).toBe(true);
    expect(matchesDomain("https://www.example.com", "example.com")).toBe(true);
    expect(matchesDomain("https://notexample.com/", "example.com")).toBe(false);
    expect(matchesDomain("https://example.com.evil.com/", "example.com")).toBe(false);
  });
});

describe("parseSerpEntries", () => {
  it("maps SearXNG results to 1-based entries capped at 10", () => {
    const raw = { results: Array.from({ length: 12 }, (_, i) => ({ url: `https://r${i}.com`, title: `T${i}`, content: `C${i}` })) };
    const entries = parseSerpEntries(raw);
    expect(entries).toHaveLength(10);
    expect(entries[0]).toMatchObject({ position: 1, url: "https://r0.com", title: "T0", snippet: "C0" });
    expect(entries[9]?.position).toBe(10);
  });
  it("skips malformed entries without dropping valid ones", () => {
    const raw = { results: [{ url: "https://ok.com", title: "Ok", content: "c" }, { title: "no url" }, null, { url: "https://ok2.com", title: "Ok2", content: "" }] };
    const entries = parseSerpEntries(raw);
    expect(entries.map((e) => e.url)).toEqual(["https://ok.com", "https://ok2.com"]);
    expect(entries[1]?.position).toBe(2); // positions re-sequenced after skip
  });
  it("returns [] for non-object input", () => {
    expect(parseSerpEntries(null)).toEqual([]);
    expect(parseSerpEntries({ results: "nope" })).toEqual([]);
  });
});

describe("extractKeywordRank", () => {
  const entries = parseSerpEntries({
    results: [
      { url: "https://rival.com/x", title: "R", content: "r" },
      { url: "https://www.example.com/page", title: "M", content: "m" },
    ],
  });
  it("finds the target position and flags the target row", () => {
    const result = extractKeywordRank({ domain: "example.com", entries });
    expect(result.position).toBe(2);
    expect(result.top10).toHaveLength(2);
    expect(result.top10[1]?.isTarget).toBe(true);
    expect(result.top10[0]?.isTarget).toBe(false);
  });
  it("returns null position when absent", () => {
    expect(extractKeywordRank({ domain: "absent.com", entries }).position).toBeNull();
  });
});

describe("SERP_LOCALES", () => {
  it("exposes tr-TR and en-US with SearXNG language codes", () => {
    expect(SERP_LOCALES["tr-TR"].searxngLanguage).toBe("tr-TR");
    expect(SERP_LOCALES["en-US"].searxngLanguage).toBe("en-US");
  });
});

describe("isValidPublicDomain", () => {
  it("accepts normal domains", () => {
    expect(isValidPublicDomain("example.com")).toBe(true);
    expect(isValidPublicDomain("blog.example.co.uk")).toBe(true);
  });
  it("rejects IPs, localhost, internal TLDs, missing dot", () => {
    expect(isValidPublicDomain("127.0.0.1")).toBe(false);
    expect(isValidPublicDomain("localhost")).toBe(false);
    expect(isValidPublicDomain("app.internal")).toBe(false);
    expect(isValidPublicDomain("nodot")).toBe(false);
    expect(isValidPublicDomain("bad domain.com")).toBe(false);
  });
});
