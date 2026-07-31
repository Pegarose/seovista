import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Deterministic DNS: validateSSRF resolves every hop hostname through
// node:dns/promises. Mock the module so tests can pin public vs private
// answers per hostname without real network lookups.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn();
  return { default: { lookup }, lookup };
});

// Mock the render-cache + credit-guard modules so the page-fetch path can be
// exercised without a live Redis (same pattern as fetcher-cache.test.ts).
vi.mock("../utils/render-cache.js", () => ({
  computeCacheKey: (canonicalUrl: string) => `geo:cache:${canonicalUrl}`,
  getCachedRender: vi.fn().mockResolvedValue(null),
  setCachedRender: vi.fn().mockResolvedValue(undefined),
  incrementBrowseractCreditCounter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/credit-guard.js", () => ({
  getDailyCreditStatus: vi.fn().mockResolvedValue({
    limit: 4000,
    consumed: 0,
    remaining: 4000,
    exhausted: false,
  }),
}));

import dns from "node:dns/promises";
import {
  fetchAndParseUrl,
  fetchTextSafely,
  fetchWithValidatedRedirects,
  BodyTooLargeError,
  SsrfRedirectBlockedError,
  TooManyRedirectsError,
} from "../utils/fetcher.js";

const lookupMock = dns.lookup as any;

const PUBLIC_IP = { address: "93.184.216.34", family: 4 };
const PRIVATE_IP = { address: "10.0.0.7", family: 4 };

function publicDnsForAll() {
  lookupMock.mockImplementation(async () => [PUBLIC_IP]);
}

function publicDnsExceptInternal() {
  lookupMock.mockImplementation(async (hostname: string) =>
    hostname === "internal.example.com" ? [PRIVATE_IP] : [PUBLIC_IP],
  );
}

function okResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("fetchWithValidatedRedirects", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
    publicDnsForAll();
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.BROWSERACT_WORKFLOW_ID;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the body for a direct 200 response (happy path, no redirects)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse("hello world", { "content-type": "text/plain" }),
    );
    globalThis.fetch = fetchMock as any;

    const result = await fetchWithValidatedRedirects("http://public.example.com/robots.txt", {
      maxBodyBytes: 1024,
    });

    expect(result.body).toBe("hello world");
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("http://public.example.com/robots.txt");
    expect(result.headers["content-type"]).toBe("text/plain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Redirects must be followed manually, never via undici's "follow".
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
    // SSRF validation ran before the request.
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("follows a multi-hop chain and resolves relative Location values against the current hop URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("/next"))
      .mockResolvedValueOnce(redirectResponse("../final"))
      .mockResolvedValueOnce(okResponse("final body"));
    globalThis.fetch = fetchMock as any;

    const result = await fetchWithValidatedRedirects("http://public.example.com/start", {
      maxBodyBytes: 1024,
    });

    expect(result.body).toBe("final body");
    expect(result.status).toBe(200);
    // /start + "/next" → /next; /next + "../final" → /final
    expect(result.finalUrl).toBe("http://public.example.com/final");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://public.example.com/start");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://public.example.com/next");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("http://public.example.com/final");
    // validateSSRF re-ran for every hop (3 requests → 3 DNS resolutions).
    expect(lookupMock).toHaveBeenCalledTimes(3);
  });

  it("blocks a redirect chain whose target resolves to a private IP without requesting it", async () => {
    publicDnsExceptInternal();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("http://internal.example.com/"))
      .mockResolvedValueOnce(okResponse("should never be fetched"));
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchWithValidatedRedirects("http://public.example.com/", { maxBodyBytes: 1024 }),
    ).rejects.toBeInstanceOf(SsrfRedirectBlockedError);

    // The private target was never requested.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a direct URL that resolves to a loopback/private IP", async () => {
    lookupMock.mockImplementation(async () => [{ address: "127.0.0.1", family: 4 }]);
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchWithValidatedRedirects("http://localhost:3200/", { maxBodyBytes: 1024 }),
    ).rejects.toBeInstanceOf(SsrfRedirectBlockedError);
    await expect(
      fetchWithValidatedRedirects("http://localhost:3200/", { maxBodyBytes: 1024 }),
    ).rejects.toThrow("SSRF Validation Failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects chains longer than the default 5 hops with TooManyRedirectsError", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const match = /\/hop\/(\d+)/.exec(String(url));
      const n = match?.[1] !== undefined ? Number.parseInt(match[1], 10) : 0;
      return redirectResponse(`http://public.example.com/hop/${n + 1}`);
    });
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchWithValidatedRedirects("http://public.example.com/hop/0", { maxBodyBytes: 1024 }),
    ).rejects.toBeInstanceOf(TooManyRedirectsError);

    // initial request + 5 followed hops; the 6th Location is rejected.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("honours a custom maxHops limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("/a"))
      .mockResolvedValueOnce(redirectResponse("/b"))
      .mockResolvedValueOnce(okResponse("never reached"));
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchWithValidatedRedirects("http://public.example.com/start", {
        maxBodyBytes: 1024,
        maxHops: 1,
      }),
    ).rejects.toBeInstanceOf(TooManyRedirectsError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("streams the body and aborts with BodyTooLargeError once it exceeds maxBodyBytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse("x".repeat(2048)));
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchWithValidatedRedirects("http://public.example.com/big", { maxBodyBytes: 1024 }),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("accepts a body that is exactly maxBodyBytes long", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("y".repeat(1024)));
    globalThis.fetch = fetchMock as any;

    const result = await fetchWithValidatedRedirects("http://public.example.com/exact", {
      maxBodyBytes: 1024,
    });
    expect(result.body).toHaveLength(1024);
  });
});

describe("fetchTextSafely (500 KiB cap, validated redirects)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
    publicDnsForAll();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns status, body and content type for a plain-text resource", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse("User-agent: *\nDisallow:\n", { "content-type": "text/plain" }),
    );
    globalThis.fetch = fetchMock as any;

    const result = await fetchTextSafely("http://public.example.com/robots.txt");

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("User-agent");
    expect(result.contentType).toBe("text/plain");
  });

  it("rejects a robots.txt larger than the RFC 9309 500 KiB guidance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("x".repeat(500 * 1024 + 1)));
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchTextSafely("http://public.example.com/robots.txt"),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("rejects a redirect to a private IP instead of following it blindly", async () => {
    publicDnsExceptInternal();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("http://internal.example.com/robots.txt"));
    globalThis.fetch = fetchMock as any;

    await expect(
      fetchTextSafely("http://public.example.com/robots.txt"),
    ).rejects.toBeInstanceOf(SsrfRedirectBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("page fetch path (2 MiB cap, validated redirects)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
    publicDnsForAll();
    delete process.env.BROWSERACT_API_KEY;
    delete process.env.BROWSERACT_WORKFLOW_ID;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a normal page and propagates response headers (existing behavior preserved)", async () => {
    const html =
      "<!doctype html><html><head><title>Capped Title</title></head><body><h1>Capped Heading</h1></body></html>";
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse(html, { "content-type": "text/html" }),
    );
    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl("http://public.example.com/");

    expect(result.title).toBe("Capped Title");
    expect(result.headings).toEqual([{ level: 1, text: "Capped Heading" }]);
    expect(result.headers["content-type"]).toBe("text/html");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a same-host redirect and revalidates each hop before fetching", async () => {
    const html =
      "<!doctype html><html><head><title>Redirected</title></head><body><h1>Redirected Heading</h1></body></html>";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("/home"))
      .mockResolvedValueOnce(okResponse(html, { "content-type": "text/html" }));
    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl("http://public.example.com/");

    expect(result.title).toBe("Redirected");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://public.example.com/home");
    // 3 DNS resolutions: fetchAndParseUrl validates the initial URL at the top
    // level, then fetchWithValidatedRedirects revalidates each of the 2 hops.
    expect(lookupMock).toHaveBeenCalledTimes(3);
  });

  it("rejects an HTML page larger than 2 MiB with BodyTooLargeError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse("x".repeat(2 * 1024 * 1024 + 1)));
    globalThis.fetch = fetchMock as any;

    await expect(fetchAndParseUrl("http://public.example.com/")).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
  });
});
