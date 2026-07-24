import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import type { ParsedPage } from "@seovista/geo-engine";

// Mock the render-cache module so we can observe cache decisions without a
// live Redis. The fetcher imports these named exports from ./render-cache.js.
vi.mock("../utils/render-cache.js", () => ({
  computeCacheKey: (canonicalUrl: string) =>
    `geo:cache:${createHash("sha256").update(canonicalUrl, "utf8").digest("hex")}`,
  getCachedRender: vi.fn().mockResolvedValue(null),
  setCachedRender: vi.fn().mockResolvedValue(undefined),
  incrementBrowseractCreditCounter: vi.fn().mockResolvedValue(undefined),
}));

import { fetchAndParseUrl } from "../utils/fetcher.js";
import {
  getCachedRender,
  setCachedRender,
  incrementBrowseractCreditCounter,
} from "../utils/render-cache.js";

const mockedGetCachedRender = vi.mocked(getCachedRender);
const mockedSetCachedRender = vi.mocked(setCachedRender);
const mockedIncrementCounter = vi.mocked(incrementBrowseractCreditCounter);

const TARGET_URL = "https://example.com/";
const EXPECTED_CACHE_KEY = `geo:cache:${createHash("sha256").update(TARGET_URL, "utf8").digest("hex")}`;

function sampleParsedPage(overides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html" },
    title: "Cached Title",
    metaRobots: { noindex: false, nofollow: false },
    headings: [{ level: 1, text: "Cached Heading" }],
    links: [],
    images: [],
    jsonLd: [],
    rawHtml: "<html><body><h1>Cached Heading</h1></body></html>",
    textContent: "Cached Heading",
    ...overides,
  };
}

function cheerioFetchMock(html: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => html,
    json: async () => ({}),
    headers: { forEach: (cb: (v: string, k: string) => void) => cb("text/html", "content-type") },
  });
}

describe("fetcher render cache", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetCachedRender.mockReset();
    mockedSetCachedRender.mockReset();
    mockedIncrementCounter.mockReset();
    // Default: cache miss, counter + write succeed.
    mockedGetCachedRender.mockResolvedValue(null);
    mockedSetCachedRender.mockResolvedValue(undefined);
    mockedIncrementCounter.mockResolvedValue(undefined);
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.BROWSERACT_WORKFLOW_ID;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the cached ParsedPage on a cache hit without fetching or incrementing the credit counter", async () => {
    const cached = sampleParsedPage({ title: "From Cache" });
    mockedGetCachedRender.mockResolvedValue(cached);

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl(TARGET_URL);

    expect(result).toEqual(cached);
    expect(mockedGetCachedRender).toHaveBeenCalledWith(EXPECTED_CACHE_KEY);
    // No fresh render → no fetch, no counter increment, no cache write.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockedIncrementCounter).not.toHaveBeenCalled();
    expect(mockedSetCachedRender).not.toHaveBeenCalled();
  });

  it("on a cache miss fetches, increments the credit counter, and writes the render back to the cache", async () => {
    mockedGetCachedRender.mockResolvedValue(null);
    globalThis.fetch = cheerioFetchMock(
      "<!doctype html><html><head><title>Fresh</title></head><body><h1>Fresh Heading</h1></body></html>",
    ) as any;

    const result = await fetchAndParseUrl(TARGET_URL);

    expect(result.title).toBe("Fresh");
    expect(mockedGetCachedRender).toHaveBeenCalledWith(EXPECTED_CACHE_KEY);
    expect(mockedIncrementCounter).toHaveBeenCalledTimes(1);
    expect(mockedSetCachedRender).toHaveBeenCalledTimes(1);
    const [key, stored] = mockedSetCachedRender.mock.calls[0]!;
    expect(key).toBe(EXPECTED_CACHE_KEY);
    expect(stored.title).toBe("Fresh");
    expect(stored.rawHtml).toContain("Fresh Heading");
  });

  it("forceAudit: true bypasses the cache lookup but still increments the counter and refreshes the cache", async () => {
    // Even if a cache entry exists, forceAudit must skip the read.
    const cached = sampleParsedPage({ title: "Should Be Ignored" });
    mockedGetCachedRender.mockResolvedValue(cached);

    globalThis.fetch = cheerioFetchMock(
      "<!doctype html><html><head><title>Forced Fresh</title></head><body><h1>Forced</h1></body></html>",
    ) as any;

    const result = await fetchAndParseUrl(TARGET_URL, { forceAudit: true });

    expect(result.title).toBe("Forced Fresh");
    // Cache read must not happen on bypass.
    expect(mockedGetCachedRender).not.toHaveBeenCalled();
    // Counter increments on bypass (fresh render decision).
    expect(mockedIncrementCounter).toHaveBeenCalledTimes(1);
    // Fresh render is written back so subsequent audits reuse it.
    expect(mockedSetCachedRender).toHaveBeenCalledTimes(1);
    expect(mockedSetCachedRender.mock.calls[0]![0]).toBe(EXPECTED_CACHE_KEY);
  });

  it("uses the geo:cache:{sha256(canonicalUrl)} key pattern (VAL-A-SPA-003)", async () => {
    mockedGetCachedRender.mockResolvedValue(null);
    globalThis.fetch = cheerioFetchMock("<html><body><h1>x</h1></body></html>") as any;

    await fetchAndParseUrl(TARGET_URL);

    const key = mockedSetCachedRender.mock.calls[0]![0];
    expect(key.startsWith("geo:cache:")).toBe(true);
    const hashPart = key.slice("geo:cache:".length);
    expect(hashPart).toBe(createHash("sha256").update(TARGET_URL, "utf8").digest("hex"));
    expect(hashPart).toHaveLength(64); // sha256 hex
  });

  it("cache miss and forceAudit bypass both increment the counter exactly once per call", async () => {
    mockedGetCachedRender.mockResolvedValue(null);
    globalThis.fetch = cheerioFetchMock("<html><body><h1>x</h1></body></html>") as any;

    await fetchAndParseUrl(TARGET_URL);
    await fetchAndParseUrl(TARGET_URL, { forceAudit: true });

    expect(mockedIncrementCounter).toHaveBeenCalledTimes(2);
  });
});
