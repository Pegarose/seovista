import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchAndParseUrl } from "../utils/fetcher.js";

// Save original fetch and env
const originalFetch = globalThis.fetch;

describe("fetcher with Browseract integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.BROWSERACT_API_KEY;
  });

  it("fails SSRF validation for loopback / internal IP targets", async () => {
    await expect(fetchAndParseUrl("http://127.0.0.1")).rejects.toThrow("SSRF Validation Failed");
    await expect(fetchAndParseUrl("http://localhost:3000")).rejects.toThrow("SSRF Validation Failed");
  });

  it("calls Browseract POST endpoint when BROWSERACT_API_KEY is configured", async () => {
    process.env.BROWSERACT_API_KEY = "test_browseract_key";

    const mockBrowseractHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Browseract Rendered SPA Title</title></head>
        <body>
          <h1>Rendered Heading</h1>
          <p>This content was dynamically rendered by JavaScript.</p>
          <a href="/internal-link">Link Text</a>
        </body>
      </html>
    `;

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (typeof url === "string" && url.includes("browseract")) {
        expect(options.method).toBe("POST");
        expect(options.headers["Authorization"]).toBe("Bearer test_browseract_key");
        expect(options.headers["X-API-Key"]).toBe("test_browseract_key");
        const body = JSON.parse(options.body);
        expect(body.url).toBe("https://example.com");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ html: mockBrowseractHtml })
        });
      }
      return Promise.reject(new Error("Unexpected fetch call"));
    });

    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl("https://example.com");

    expect(result.title).toBe("Browseract Rendered SPA Title");
    expect(result.headings).toEqual([{ level: 1, text: "Rendered Heading" }]);
    expect(result.textContent).toContain("This content was dynamically rendered");
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.isInternal).toBe(true);
  });

  it("falls back to standard Cheerio fetch if Browseract fails or rate limits", async () => {
    process.env.BROWSERACT_API_KEY = "test_browseract_key";

    const mockCheerioHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Static Fallback Title</title></head>
        <body>
          <h1>Fallback Heading</h1>
          <p>Static fallback HTML text content that is sufficiently long to avoid trigger JS bundle retry logic.</p>
        </body>
      </html>
    `;

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (typeof url === "string" && url.includes("browseract")) {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: "Rate Limit Exceeded"
        });
      }
      // Standard Cheerio GET fallback
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => mockCheerioHtml
      });
    });

    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl("https://example.com");

    expect(result.title).toBe("Static Fallback Title");
    expect(result.headings).toEqual([{ level: 1, text: "Fallback Heading" }]);
    expect(result.textContent).toContain("Static fallback HTML text content");
  });

  it("uses Cheerio when BROWSERACT_API_KEY is not set", async () => {
    delete process.env.BROWSERACT_API_KEY;

    const mockStaticHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Normal Cheerio Title</title></head>
        <body><h1>Normal Heading</h1></body>
      </html>
    `;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => mockStaticHtml
    });

    globalThis.fetch = fetchMock as any;

    const result = await fetchAndParseUrl("https://example.com");

    expect(result.title).toBe("Normal Cheerio Title");
    expect(result.headings).toEqual([{ level: 1, text: "Normal Heading" }]);
  });
});
