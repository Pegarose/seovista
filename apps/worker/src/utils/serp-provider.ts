import {
  parseSerpEntries,
  SERP_LOCALES,
  type SerpEntry,
  type SerpLocale,
} from "@seovista/seo-core";

/**
 * SERP provider boundary for the keyword rank checker.
 *
 * Two implementations behind one interface:
 *
 *   - `SearxngProvider` — operator-configured SearXNG JSON API client. The
 *     endpoint comes from the trusted `SEARXNG_BASE_URL` environment variable
 *     (operator input, not user input), so it is intentionally NOT routed
 *     through the user-input SSRF guard in `utils/fetcher.ts`. It is still
 *     constrained: http/https only, a per-request timeout, and a hard body
 *     cap so a misconfigured or hostile endpoint cannot exhaust worker
 *     memory. All failures surface as typed `SerpProviderError` codes that
 *     the keyword-rank worker maps to terminal job statuses.
 *   - `MockSerpProvider` — deterministic synthetic top-10 used when
 *     `SEARXNG_BASE_URL` is unset (Sprint 0 mock-era posture: no live
 *     provider traffic). Same inputs always produce the same entries, and the
 *     target domain always appears exactly once so the UI can demonstrate the
 *     full result layout honestly labelled as sample data.
 */

export type SerpProviderErrorCode =
  | "provider.timeout"
  | "provider.unavailable"
  | "provider.misconfigured";

/**
 * Typed error raised by SERP providers. `retryable` mirrors the provider
 * error taxonomy used by the geo/schema workers: timeouts and transient
 * unavailability are retryable (mapped to the `timeout` terminal status),
 * while a misconfigured endpoint is permanent (no retry can fix it).
 */
export class SerpProviderError extends Error {
  readonly code: SerpProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: SerpProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "SerpProviderError";
    this.code = code;
    this.retryable = code !== "provider.misconfigured";
    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export interface SerpProvider {
  /** Which backend produced the entries; persisted as the payload dataSource. */
  readonly source: "searxng" | "mock";
  /**
   * Returns up to 10 one-based SERP entries for `keyword` in `locale`.
   * `domain` is optional for the interface but the mock uses it to place the
   * target entry; production callers always pass it.
   */
  search(keyword: string, locale: SerpLocale, domain?: string): Promise<SerpEntry[]>;
}

/** Hard cap on the SearXNG response body (1 MiB). */
const MAX_BODY_BYTES = 1024 * 1024;

/** Default per-request timeout for the SearXNG client (15 s). */
const DEFAULT_TIMEOUT_MS = 15_000;

export interface SearxngProviderOptions {
  /** Operator-configured SearXNG base URL (http/https only). */
  baseUrl: string;
  /** Fetch implementation override; tests inject a mock. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds (default 15000). */
  timeoutMs?: number;
}

export class SearxngProvider implements SerpProvider {
  readonly source = "searxng" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SearxngProviderOptions) {
    let parsed: URL;
    try {
      parsed = new URL(options.baseUrl);
    } catch {
      throw new SerpProviderError(
        "provider.misconfigured",
        `SEARXNG_BASE_URL is not a valid URL: ${options.baseUrl}`,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SerpProviderError(
        "provider.misconfigured",
        `SEARXNG_BASE_URL must use http or https, got ${parsed.protocol}`,
      );
    }
    this.baseUrl = options.baseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(keyword: string, locale: SerpLocale): Promise<SerpEntry[]> {
    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("q", keyword);
    url.searchParams.set("format", "json");
    url.searchParams.set("language", SERP_LOCALES[locale].searxngLanguage);

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortOrTimeout(error)) {
        throw new SerpProviderError(
          "provider.timeout",
          `SearXNG request timed out after ${this.timeoutMs}ms`,
          { cause: error },
        );
      }
      throw new SerpProviderError(
        "provider.unavailable",
        `SearXNG request failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new SerpProviderError(
        "provider.unavailable",
        `SearXNG responded with HTTP ${response.status}`,
      );
    }

    const body = await readBodyWithCap(response, MAX_BODY_BYTES, url.toString());

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new SerpProviderError(
        "provider.unavailable",
        "SearXNG returned a non-JSON response body",
        { cause: error },
      );
    }

    return parseSerpEntries(parsed);
  }
}

function isAbortOrTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Streams a response body up to `maxBodyBytes`, aborting the reader (and
 * throwing `provider.unavailable`) as soon as the cap is exceeded so the full
 * body is never buffered. Mirrors `readBodyWithCap` in `utils/fetcher.ts`,
 * including the `response.text()` fallback for the plain-object fetch mocks
 * used by unit tests.
 */
async function readBodyWithCap(response: Response, maxBodyBytes: number, url: string): Promise<string> {
  const stream = response.body;
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        received += value.byteLength;
        if (received > maxBodyBytes) {
          await reader.cancel().catch(() => undefined);
          throw new SerpProviderError(
            "provider.unavailable",
            `SearXNG response body from ${url} exceeded the ${maxBodyBytes}-byte limit`,
          );
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    throw new SerpProviderError(
      "provider.unavailable",
      `SearXNG response body from ${url} exceeded the ${maxBodyBytes}-byte limit`,
    );
  }
  return text;
}

/**
 * Clearly-synthetic placeholder hosts for the mock provider. The
 * `rakip-ornek-N.com` naming (Turkish for "example rival") makes the sample
 * nature of the data obvious in any persisted payload or screenshot.
 */
const MOCK_RIVAL_HOSTS = [
  "rakip-ornek-1.com",
  "rakip-ornek-2.com",
  "rakip-ornek-3.com",
  "rakip-ornek-4.com",
  "rakip-ornek-5.com",
  "rakip-ornek-6.com",
  "rakip-ornek-7.com",
  "rakip-ornek-8.com",
  "rakip-ornek-9.com",
] as const;

/** Inserted when the caller omits the target domain (never in production). */
const MOCK_FALLBACK_DOMAIN = "ornek-hedef.com";

/**
 * Deterministic 32-bit FNV-1a hash. Stable across processes and runs so the
 * mock always places the same (domain, keyword) pair at the same position.
 */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class MockSerpProvider implements SerpProvider {
  readonly source = "mock" as const;

  async search(keyword: string, _locale: SerpLocale, domain?: string): Promise<SerpEntry[]> {
    const target = domain ?? MOCK_FALLBACK_DOMAIN;
    // The target lands at a deterministic 1-based position derived from the
    // (domain, keyword) pair; the nine synthetic rivals fill the rest.
    const insertIndex = stableHash(`${target}${keyword}`) % 10;
    const urls = MOCK_RIVAL_HOSTS.map((host) => `https://${host}/`);
    urls.splice(insertIndex, 0, `https://${target}/`);

    return urls.map((url, index) => ({
      position: index + 1,
      url,
      title: `Örnek sonuç ${index + 1} — ${keyword}`,
      snippet:
        "Deterministik örnek veridir; SearXNG yapılandırılmadığı için gerçek arama sonucu değildir.",
    }));
  }
}

/**
 * Resolves the SERP provider from the environment: a configured
 * `SEARXNG_BASE_URL` selects the live SearXNG client; anything else selects
 * the deterministic mock (Sprint 0 default).
 */
export function resolveSerpProvider(
  env: { SEARXNG_BASE_URL?: string | undefined } = process.env,
): SerpProvider {
  const baseUrl = env.SEARXNG_BASE_URL?.trim();
  if (baseUrl) {
    return new SearxngProvider({ baseUrl });
  }
  return new MockSerpProvider();
}
