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
  getDailyCreditLimit: vi.fn().mockReturnValue(4000),
  getDailyCreditConsumed: vi.fn().mockResolvedValue(0),
}));

// Mock the credit-guard module so the fetcher's guard check is observable
// without a live Redis. Default status: under the limit (exhausted=false) so
// the existing render-cache tests' "counter increments on miss/bypass"
// assertions still hold.
vi.mock("../utils/credit-guard.js", () => ({
  getDailyCreditStatus: vi.fn().mockResolvedValue({
    limit: 4000,
    consumed: 0,
    remaining: 4000,
    exhausted: false,
  }),
}));

import { fetchAndParseUrl } from "../utils/fetcher.js";
import {
  getCachedRender,
  setCachedRender,
  incrementBrowseractCreditCounter,
} from "../utils/render-cache.js";
import { getDailyCreditStatus } from "../utils/credit-guard.js";

const mockedGetCachedRender = vi.mocked(getCachedRender);
const mockedSetCachedRender = vi.mocked(setCachedRender);
const mockedIncrementCounter = vi.mocked(incrementBrowseractCreditCounter);
const mockedGetDailyCreditStatus = vi.mocked(getDailyCreditStatus);

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
    mockedGetDailyCreditStatus.mockReset();
    // Default: cache miss, counter + write succeed, credit guard under limit.
    mockedGetCachedRender.mockResolvedValue(null);
    mockedSetCachedRender.mockResolvedValue(undefined);
    mockedIncrementCounter.mockResolvedValue(undefined);
    mockedGetDailyCreditStatus.mockResolvedValue({
      limit: 4000,
      consumed: 0,
      remaining: 4000,
      exhausted: false,
    });
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.BROWSERACT_WORKFLOW_ID;
    delete process.env.BROWSERACT_DAILY_CREDIT_LIMIT;
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

  it("credit guard exhausted: skips Browseract, does not increment the counter, and falls back to Cheerio (VAL-A-MIT-003)", async () => {
    // Counter at the limit → guard must fire.
    mockedGetDailyCreditStatus.mockResolvedValue({
      limit: 4000,
      consumed: 4000,
      remaining: 0,
      exhausted: true,
    });
    // Browseract IS configured in this test, so without the guard the fetcher
    // would attempt a Browseract call. The guard must prevent that.
    process.env.BROWSERACT_API_KEY = "test-key";
    process.env.BROWSERACT_WORKFLOW_ID = "test-workflow";

    const fetchMock = cheerioFetchMock(
      "<!doctype html><html><head><title>Cheerio Only</title></head><body><h1>Cheerio</h1></body></html>",
    );
    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl(TARGET_URL);

    // Audit still completes via the Cheerio-only path.
    expect(result.title).toBe("Cheerio Only");
    // No Browseract credit consumed because no Browseract call was attempted.
    expect(mockedIncrementCounter).not.toHaveBeenCalled();
    // Cheerio fetch happened exactly once (no Browseract run-task POST).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // First call is the Cheerio GET (no run-task POST to the Browseract API).
    const firstCallArgs = fetchMock.mock.calls[0]!;
    const firstUrl = String(firstCallArgs[0]);
    expect(firstUrl).toBe(TARGET_URL);
    // Fresh Cheerio render is still cached for future audits.
    expect(mockedSetCachedRender).toHaveBeenCalledTimes(1);
  });

  it("credit guard exhausted via forceAudit bypass: still skips Browseract and the counter increment", async () => {
    mockedGetDailyCreditStatus.mockResolvedValue({
      limit: 4000,
      consumed: 5000,
      remaining: 0,
      exhausted: true,
    });
    process.env.BROWSERACT_API_KEY = "test-key";
    process.env.BROWSERACT_WORKFLOW_ID = "test-workflow";

    globalThis.fetch = cheerioFetchMock(
      "<!doctype html><html><head><title>Forced Cheerio</title></head><body><h1>Forced</h1></body></html>",
    ) as any;

    const result = await fetchAndParseUrl(TARGET_URL, { forceAudit: true });

    expect(result.title).toBe("Forced Cheerio");
    expect(mockedGetCachedRender).not.toHaveBeenCalled();
    expect(mockedIncrementCounter).not.toHaveBeenCalled();
  });

  it("credit guard under limit with Browseract configured: counter increments and Browseract is attempted", async () => {
    // Just below the limit → guard allows the call.
    mockedGetDailyCreditStatus.mockResolvedValue({
      limit: 4000,
      consumed: 3999,
      remaining: 1,
      exhausted: false,
    });
    process.env.BROWSERACT_API_KEY = "test-key";
    process.env.BROWSERACT_WORKFLOW_ID = "test-workflow";

    // Browseract run-task POST returns a minimal task id, then status poll
    // returns "failed" so the fetcher falls back to Cheerio without endless
    // polling. This proves the guard did NOT block the Browseract attempt.
    const browseractFetch = vi.fn(async (url: string, _init?: any) => {
      if (url.includes("/workflow/run-task")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ id: "task-1" }),
          text: async () => "",
          headers: { forEach: () => {} },
        };
      }
      if (url.includes("/workflow/get-task-status")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ status: "failed" }),
          text: async () => "",
          headers: { forEach: () => {} },
        };
      }
      // Cheerio fallback fetch.
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          "<!doctype html><html><head><title>Fallback</title></head><body><h1>Fallback</h1></body></html>",
        json: async () => ({}),
        headers: {
          forEach: (cb: (v: string, k: string) => void) => cb("text/html", "content-type"),
        },
      };
    });
    globalThis.fetch = browseractFetch as any;

    const result = await fetchAndParseUrl(TARGET_URL);

    expect(result.title).toBe("Fallback");
    // Counter incremented because the guard allowed the render decision.
    expect(mockedIncrementCounter).toHaveBeenCalledTimes(1);
    // Browseract run-task was actually attempted (guard did not skip it).
    const runTaskCall = browseractFetch.mock.calls.find(([u]) =>
      String(u).includes("/workflow/run-task"),
    );
    expect(runTaskCall).toBeDefined();
  });
});
