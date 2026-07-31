import { describe, expect, it, vi } from "vitest";
import { MockSerpProvider, resolveSerpProvider, SearxngProvider, SerpProviderError } from "../utils/serp-provider";

describe("MockSerpProvider", () => {
  it("is deterministic and always contains the target domain exactly once in top 10", async () => {
    const provider = new MockSerpProvider();
    const a = await provider.search("seo denetimi", "tr-TR", "example.com");
    const b = await provider.search("seo denetimi", "tr-TR", "example.com");
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(a.filter((e) => e.url.includes("example.com"))).toHaveLength(1);
    expect(a.every((e) => e.position >= 1 && e.position <= 10)).toBe(true);
  });
});

describe("SearxngProvider", () => {
  it("builds the JSON search URL with language and returns parsed entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      body: null, // triggers text() fallback
      text: async () => JSON.stringify({ results: [{ url: "https://a.com", title: "A", content: "c" }] }),
    });
    const provider = new SearxngProvider({ baseUrl: "http://127.0.0.1:8088", fetchImpl: fetchMock as never });
    const entries = await provider.search("test keyword", "tr-TR");
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("format")).toBe("json");
    expect(calledUrl.searchParams.get("language")).toBe("tr-TR");
    expect(entries[0]).toMatchObject({ position: 1, url: "https://a.com" });
  });
  it("maps non-OK responses to provider.unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, body: null, text: async () => "" });
    const provider = new SearxngProvider({ baseUrl: "http://127.0.0.1:8088", fetchImpl: fetchMock as never });
    await expect(provider.search("x", "en-US")).rejects.toMatchObject({ code: "provider.unavailable" });
  });
  it("rejects non-http base URLs as misconfigured", () => {
    expect(() => new SearxngProvider({ baseUrl: "ftp://x" })).toThrowError(SerpProviderError);
  });
});

describe("resolveSerpProvider", () => {
  it("returns mock when SEARXNG_BASE_URL is unset, searxng when set", () => {
    expect(resolveSerpProvider({}).source).toBe("mock");
    expect(resolveSerpProvider({ SEARXNG_BASE_URL: "http://127.0.0.1:8088" }).source).toBe("searxng");
  });
});
