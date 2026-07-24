import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { type ParsedPage } from "@seovista/geo-engine";
import {
  computeCacheKey,
  getCachedRender,
  setCachedRender,
  incrementBrowseractCreditCounter,
} from "./render-cache.js";
import { getDailyCreditStatus } from "./credit-guard.js";

/**
 * Options passed to {@link fetchAndParseUrl}.
 *
 * `forceAudit: true` bypasses the render cache and triggers a fresh render
 * (the fresh result is written back to the cache so subsequent non-forced
 * audits benefit from it). See VAL-A-SPA-002.
 */
export interface FetchAndParseUrlOptions {
  forceAudit?: boolean;
}

/**
 * Extended fetch result carrying render-cache metadata. `cacheHit` is `true`
 * when the parsed page was served from `geo:cache:{sha256(canonicalUrl)}`
 * without invoking Browseract / Cheerio (VAL-A-SPA-001). Callers that need the
 * cache-hit flag for telemetry (e.g. the `audit_completed` Sentry event,
 * VAL-A-OBS-002) should use {@link fetchAndParseUrlWithMeta}; callers that
 * only need the page can keep using {@link fetchAndParseUrl}.
 */
export interface FetchAndParseUrlResult {
  parsedPage: ParsedPage;
  cacheHit: boolean;
}

/**
 * Validates a hostname to prevent SSRF (Server-Side Request Forgery).
 * Rejects IP addresses that map to private, loopback, link-local, or otherwise internal/reserved ranges.
 * 
 * @param urlString The URL to validate.
 * @throws {Error} If the URL is invalid or the hostname resolves to a forbidden IP.
 */
async function validateSSRF(urlString: string): Promise<void> {
  const url = new URL(urlString);
  const hostname = url.hostname;

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    
    for (const address of addresses) {
      const ip = address.address;
      
      try {
        const parsedIp = ipaddr.parse(ip);
        
        const range = parsedIp.range();
        
        // Define forbidden ranges according to ipaddr.js categories
        const forbiddenRanges = [
            'unspecified',
            'broadcast',
            'multicast',
            'linkLocal',
            'loopback',
            'carrierGradeNat',
            'private',
            'reserved'
        ];
        
        if (forbiddenRanges.includes(range)) {
            throw new Error(`SSRF Validation Failed: Address ${ip} is in forbidden range '${range}'.`);
        }
        
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('SSRF Validation Failed')) {
           throw err;
        }
        // If ipaddr.js throws during parse, it might be an invalid IP (rare from dns.lookup), 
        // string but we can't trust it.
        throw new Error(`SSRF Validation Failed: Could not parse IP address ${ip}.`);
      }
    }
  } catch (err) {
      if (err instanceof Error && err.message.startsWith('SSRF Validation Failed')) {
          throw err;
      }
      throw new Error(`SSRF Validation Failed: DNS lookup failed for ${hostname} - ${(err as Error).message}`);
  }
}

/**
 * Helper function to parse HTML string into ParsedPage using Cheerio.
 */
function parseHtmlToParsedPage(rawHtml: string, targetUrl: string, statusCode: number = 200, headers: Record<string, string> = {}): ParsedPage {
  const requestUrl = new URL(targetUrl);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  const $ = cheerio.load(rawHtml);
  
  // Title
  const title = $("title").text().trim() || undefined;

  // Meta Description
  const metaDescription = $("meta[name='description']").attr("content")?.trim() || undefined;
  
  // Canonical Link
  const canonical = $("link[rel='canonical']").attr("href")?.trim() || undefined;

  // Robots
  const robotsQuery = $("meta[name='robots']").attr("content")?.toLowerCase() || "";
  const metaRobots = {
    noindex: robotsQuery.includes("noindex"),
    nofollow: robotsQuery.includes("nofollow")
  };

  // Headings
  const headings: { level: number; text: string }[] = [];
  $(":header").each((_, element) => {
      const tagName = element.tagName.toLowerCase();
      // e.g. "h1" -> 1
      const level = parseInt(tagName.replace("h", ""), 10);
      const text = $(element).text().trim();
      
      if (!isNaN(level) && text) {
          headings.push({ level, text });
      }
  });

  // Links
  const links: { href: string; text: string; isInternal: boolean }[] = [];
  $("a[href]").each((_, element) => {
      let href = $(element).attr("href")?.trim() || "";
      const text = $(element).text().trim();
      
      if (!href) return;
      
      let isInternal = false;
      try {
          // Check if internal relative or absolute matching base URL
          if (href.startsWith("/") && !href.startsWith("//")) {
              isInternal = true;
          } else {
             const linkUrl = new URL(href, baseUrl);
             if (linkUrl.hostname === requestUrl.hostname) {
                 isInternal = true;
             }
          }
      } catch {
         // Invalid URL syntax, ignore internal matching
      }
      links.push({ href, text, isInternal });
  });

  // Images
  const images: { src: string; alt?: string }[] = [];
  $("img[src]").each((_, element) => {
      const src = $(element).attr("src")?.trim() || "";
      const altAttr = $(element).attr("alt");
      const alt = altAttr !== undefined ? altAttr.trim() : undefined;
      
      if (src) {
          const img: { src: string; alt?: string } = { src };
          if (alt !== undefined) {
             img.alt = alt;
          }
          images.push(img);
      }
  });

  // JSON-LD
  const jsonLd: any[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
      try {
          const content = $(element).html();
          if (content) {
              const parsed = JSON.parse(content);
              // Handle array of graphs vs single graph
              if (Array.isArray(parsed)) {
                  jsonLd.push(...parsed);
              } else {
                  jsonLd.push(parsed);
              }
          }
      } catch {
          // Ignore invalid JSON
      }
  });

  // Open Graph
  const og: Record<string, string> = {};
  $("meta[property^='og:']").each((_, element) => {
      const prop = $(element).attr("property")?.replace("og:", "");
      const content = $(element).attr("content");
      if (prop && content) {
          og[prop] = content;
      }
  });

  // Twitter Cards
  const twitter: Record<string, string> = {};
  $("meta[name^='twitter:']").each((_, element) => {
      const name = $(element).attr("name")?.replace("twitter:", "");
      const content = $(element).attr("content");
      if (name && content) {
          twitter[name] = content;
      }
  });

  // Text Content (extract text of body without script/style tags)
  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript, iframe, svg").remove();
  const textContent = bodyClone.text().replace(/\s+/g, ' ').trim();

  // Construct return object avoiding undefined assignments for exactOptionalPropertyTypes
  const parsedPage: ParsedPage = {
    statusCode,
    headers,
    metaRobots,
    headings,
    links,
    images,
    jsonLd,
    rawHtml,
    textContent
  };

  if (title !== undefined) parsedPage.title = title;
  if (metaDescription !== undefined) parsedPage.metaDescription = metaDescription;
  if (canonical !== undefined) parsedPage.canonical = canonical;

  const validOg = Object.keys(og).length > 0 ? og : undefined;
  if (validOg !== undefined) parsedPage.og = validOg;
  
  const validTwitter = Object.keys(twitter).length > 0 ? twitter : undefined;
  if (validTwitter !== undefined) parsedPage.twitter = validTwitter;

  return parsedPage;
}

/**
 * Checks whether raw HTML looks like a Client-Side Rendered (CSR) / SPA shell.
 * E.g., minimal body text, root div without content, or typical React/Angular bundle scripts with empty root.
 */
function isJsBundleRendering(rawHtml: string, parsed: ParsedPage): boolean {
  // If body has very little text content (e.g. <div id="root"></div> without pre-rendered elements)
  // or contains root/app elements with zero headings and minimal text
  const textLength = parsed.textContent.length;

  const $ = cheerio.load(rawHtml);
  const hasAppShell = $("#root, #app, #__next, app-root").length > 0;

  if (hasAppShell && textLength < 150) {
    return true;
  }

  // Also check if text content is extremely short (< 50 chars) and JS bundle scripts exist
  const scriptCount = $("script[src]").length;
  if (textLength < 50 && scriptCount > 0) {
    return true;
  }

  return false;
}

/**
 * Recursively collects string values from an arbitrary JSON value into `out`.
 */
function collectStringValues(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, out);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const val of Object.values(value as Record<string, unknown>)) {
      collectStringValues(val, out);
    }
  }
}

/**
 * Extracts rendered HTML from a Browseract `output.string` payload.
 *
 * Browseract wraps the rendered HTML in a JSON array, e.g.:
 *   [{"script_result_1": "<html lang=\"en\">...</html>"}]
 * Cheerio is lenient enough to find <title>/<h1> inside the JSON-wrapped
 * string, but `textContent` becomes polluted with brackets and property
 * names like `script_result_1`. This unwraps the HTML when possible and
 * falls back to the raw string when it is not JSON (raw HTML).
 *
 * Handles common patterns:
 *   - Single array with one element: `[{"script_result_1": "..."}]`
 *   - Array with multiple results: uses the first HTML-looking string
 *   - Object directly: `{"html": "..."}` / `{"content": "..."}`
 */
function extractHtmlFromBrowseractOutput(outputString: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputString);
  } catch {
    // Not valid JSON — assume it is already raw HTML.
    return outputString;
  }

  const candidates: string[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      collectStringValues(item, candidates);
    }
  } else if (parsed !== null && typeof parsed === 'object') {
    collectStringValues(parsed, candidates);
  }

  // Prefer the first string that looks like HTML.
  for (const candidate of candidates) {
    if (candidate.includes('<')) {
      return candidate;
    }
  }

  // No HTML-looking string found; fall back to first candidate, else original.
  const firstCandidate = candidates[0];
  return firstCandidate ?? outputString;
}

/**
 * Fetches rendered HTML from the Browseract.com workflow API (v2).
 *
 * Browseract is a workflow-based system. The flow is:
 *   1. POST /v2/workflow/run-task  -> starts a task, returns { id }
 *   2. GET  /v2/workflow/get-task-status?task_id=xxx  -> poll until "finished"
 *   3. GET  /v2/workflow/get-task?task_id=xxx         -> retrieve output.string (rendered HTML)
 *
 * Requires both BROWSERACT_API_KEY and BROWSERACT_WORKFLOW_ID env vars.
 */
async function fetchViaBrowseract(targetUrl: string, apiKey: string): Promise<string> {
  const workflowId = process.env.BROWSERACT_WORKFLOW_ID;
  if (!workflowId) {
    throw new Error("Browseract skipped: BROWSERACT_WORKFLOW_ID is not set");
  }

  const baseUrl = (process.env.BROWSERACT_API_URL || "https://api.browseract.com/v2").replace(/\/$/, "");
  const authHeaders = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  // 1. Start the task
  const runResponse = await fetch(`${baseUrl}/workflow/run-task`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      workflow_id: workflowId,
      input_parameters: [
        { name: "url", value: targetUrl }
      ]
    })
  });

  if (!runResponse.ok) {
    const errText = await runResponse.text().catch(() => "");
    throw new Error(`Browseract run-task error: ${runResponse.status} ${runResponse.statusText}${errText ? ` - ${errText}` : ""}`);
  }

  const runData = await runResponse.json() as { id?: string };
  const taskId = runData.id;
  if (!taskId) {
    throw new Error("Browseract run-task response did not contain a task id");
  }

  // 2. Poll for status every 5s, max 120s
  const pollIntervalMs = 5000;
  const maxPollMs = 120000;
  const startedAt = Date.now();
  let status: string = "running";

  while (Date.now() - startedAt < maxPollMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const statusResponse = await fetch(
      `${baseUrl}/workflow/get-task-status?task_id=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: authHeaders }
    );

    if (!statusResponse.ok) {
      const errText = await statusResponse.text().catch(() => "");
      throw new Error(`Browseract get-task-status error: ${statusResponse.status} ${statusResponse.statusText}${errText ? ` - ${errText}` : ""}`);
    }

    const statusData = await statusResponse.json() as { status?: string };
    status = statusData.status ?? "running";

    if (status === "finished") {
      break;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error(`Browseract task ${status} for task ${taskId}`);
    }
    // otherwise keep polling (running, queued, etc.)
  }

  if (status !== "finished") {
    throw new Error(`Browseract polling timed out after ${maxPollMs}ms for task ${taskId}`);
  }

  // 3. Get task result
  const resultResponse = await fetch(
    `${baseUrl}/workflow/get-task?task_id=${encodeURIComponent(taskId)}`,
    { method: "GET", headers: authHeaders }
  );

  if (!resultResponse.ok) {
    const errText = await resultResponse.text().catch(() => "");
    throw new Error(`Browseract get-task error: ${resultResponse.status} ${resultResponse.statusText}${errText ? ` - ${errText}` : ""}`);
  }

  const resultData = await resultResponse.json() as {
    output?: { string?: string; files?: string[] };
    status?: string;
  };

  const html = resultData.output?.string;
  if (html && html.trim().length > 0) {
    return extractHtmlFromBrowseractOutput(html);
  }

  // Fallback: if output.string is empty, try the first file entry
  const files = resultData.output?.files;
  const firstFile = files?.[0];
  if (firstFile) {
    return firstFile;
  }

  throw new Error("Browseract task result did not contain rendered HTML content");
}

/**
 * Standard Cheerio network fetch.
 */
async function fetchViaCheerio(targetUrl: string): Promise<{ rawHtml: string; statusCode: number; headers: Record<string, string> }> {
  const requestUrl = new URL(targetUrl);
  const response = await fetch(requestUrl.toString(), {
    headers: {
      "User-Agent": "SeoVista Crawler/1.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    }
  });

  const rawHtml = await response.text();
  const statusCode = response.status;
  
  const headersRecord: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headersRecord[key.toLowerCase()] = value;
  });

  return { rawHtml, statusCode, headers: headersRecord };
}

/**
 * Fetches the HTML content of a given URL and parses it into the structure expected by the Geo-Engine.
 *
 * Phase A — Render cache (see VAL-A-SPA-001/002/003):
 *   - Before any network call, the cache is checked at `geo:cache:{sha256(canonicalUrl)}`
 *     in Redis DB 1. On a hit the cached `ParsedPage` is returned without invoking
 *     Browseract and the fetcher logs `cache=true`.
 *   - On a cache miss or when `options.forceAudit === true`, the daily Browseract
 *     credit guard is evaluated (VAL-A-MIT-003). When
 *     `browseract:credits:consumed:{YYYY-MM-DD} >= BROWSERACT_DAILY_CREDIT_LIMIT`
 *     (default 4000), the Browseract call is skipped, the credit counter is NOT
 *     incremented, the audit proceeds with the Cheerio-only path, and a warning
 *     is logged with the remaining-counter value.
 *   - When the guard allows the call, the daily credit counter is incremented
 *     and a fresh render is performed. The fetcher logs `cache=false`.
 *   - A successful fresh render is written back to the cache with TTL
 *     `BROWSERACT_CACHE_TTL_HOURS` (default 24h), even on `forceAudit` bypass
 *     so subsequent audits reuse the refreshed snapshot.
 *   - If Redis is unavailable, the cache + counter layers degrade gracefully
 *     to a permanent miss / zero consumed and the fetch proceeds.
 *
 * First validates against SSRF.
 * If BROWSERACT_API_KEY is configured:
 *   - Attempts headless SPA rendering via Browseract API.
 *   - If Browseract rate limits or fails, falls back to standard HTTP/Cheerio fetch.
 *   - If Browseract is skipped initially, performs Cheerio fetch, and if it looks like a JS bundle rendering, retries with Browseract.
 * If BROWSERACT_API_KEY is not set or fails:
 *   - Performs standard HTTP/Cheerio fetch.
 * 
 * @param targetUrl The URL of the page to fetch and analyze.
 * @param options Optional flags. `forceAudit: true` bypasses the render cache.
 * @returns A Promise resolving to a strongly-typed `ParsedPage`.
 */
export async function fetchAndParseUrl(
  targetUrl: string,
  options: FetchAndParseUrlOptions = {},
): Promise<ParsedPage> {
  const result = await fetchAndParseUrlWithMeta(targetUrl, options);
  return result.parsedPage;
}

/**
 * Same as {@link fetchAndParseUrl} but also returns whether the parsed page
 * came from the render cache (`cacheHit: true`) or a fresh network render
 * (`cacheHit: false`). The geo-worker uses this flag to populate the
 * `cache_hit` field of the `audit_completed` Sentry event (VAL-A-OBS-002).
 */
export async function fetchAndParseUrlWithMeta(
  targetUrl: string,
  options: FetchAndParseUrlOptions = {},
): Promise<FetchAndParseUrlResult> {
  // 1. Validate against SSRF
  await validateSSRF(targetUrl);

  const forceAudit = options.forceAudit === true;
  const cacheKey = computeCacheKey(targetUrl);

  // 2. Cache lookup (skipped on forceAudit bypass)
  if (!forceAudit) {
    const cached = await getCachedRender(cacheKey);
    if (cached) {
      console.log(
        JSON.stringify({
          name: "@seovista/worker",
          layer: "fetcher",
          event: "render_cache_hit",
          cache: true,
          cacheKey,
          canonicalUrl: targetUrl,
          timestamp: new Date().toISOString(),
        })
      );
      return { parsedPage: cached, cacheHit: true };
    }
  }

  // 3. Cache miss / bypass → check the daily Browseract credit guard BEFORE
  //    consuming a credit or invoking Browseract (VAL-A-MIT-003). When the
  //    daily counter has reached `BROWSERACT_DAILY_CREDIT_LIMIT`, the
  //    Browseract call is skipped, the credit counter is NOT incremented
  //    (no render is being attempted), and the audit proceeds with the
  //    Cheerio-only path. A warning is logged carrying the remaining-counter
  //    value so operators can see the budget state.
  const creditStatus = await getDailyCreditStatus();
  const creditExhausted = creditStatus.exhausted;

  if (creditExhausted) {
    console.warn(
      JSON.stringify({
        name: "@seovista/worker",
        layer: "fetcher",
        event: "browseract_credit_guard",
        message:
          "Browseract credit guard: limit reached, falling back to Cheerio",
        remaining: creditStatus.remaining,
        limit: creditStatus.limit,
        consumed: creditStatus.consumed,
        canonicalUrl: targetUrl,
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    // Under the daily limit → consume a credit and proceed with a fresh
    // render decision. The counter increments once per miss/bypass regardless
    // of whether Browseract ultimately succeeds or falls back to Cheerio
    // (VAL-A-SPA-001 evidence: credit counter increments on miss/bypass).
    await incrementBrowseractCreditCounter();
  }

  console.log(
    JSON.stringify({
      name: "@seovista/worker",
      layer: "fetcher",
      event: "render_cache_miss",
      cache: false,
      forceAudit,
      cacheKey,
      canonicalUrl: targetUrl,
      browseractSkippedByCreditGuard: creditExhausted,
      timestamp: new Date().toISOString(),
    })
  );

  const apiKey = process.env.BROWSERACT_API_KEY;
  const workflowId = process.env.BROWSERACT_WORKFLOW_ID;
  // When the credit guard has fired, Browseract MUST NOT be invoked even if
  // the API key + workflow id are configured — the audit falls through to the
  // Cheerio-only path below (VAL-A-MIT-003: "audit completes without 2xx
  // from Browseract API").
  const browseractEnabled =
    !creditExhausted &&
    Boolean(apiKey && apiKey !== "your_key_here" && workflowId);

  let parsed: ParsedPage;

  if (browseractEnabled) {
    try {
      // Primary: Headfull engine via Browseract workflow API
      const rawHtml = await fetchViaBrowseract(targetUrl, apiKey as string);
      parsed = parseHtmlToParsedPage(rawHtml, targetUrl);
    } catch (browseractError) {
      console.warn(`Browseract engine failed or rate limited, falling back to Cheerio: ${(browseractError as Error).message}`);
      const cheerioResult = await fetchViaCheerio(targetUrl);
      parsed = parseHtmlToParsedPage(cheerioResult.rawHtml, targetUrl, cheerioResult.statusCode, cheerioResult.headers);

      // Secondary check: if Cheerio output looks like a JS bundle shell, retry Browseract once.
      if (isJsBundleRendering(cheerioResult.rawHtml, parsed)) {
        try {
          const rawHtml = await fetchViaBrowseract(targetUrl, apiKey as string);
          parsed = parseHtmlToParsedPage(rawHtml, targetUrl, cheerioResult.statusCode, cheerioResult.headers);
        } catch (browseractRetryError) {
          console.warn(`Browseract retry for JS bundle failed: ${(browseractRetryError as Error).message}`);
        }
      }
    }
  } else {
    // Default path when Browseract is not configured: Cheerio fetch only.
    const cheerioResult = await fetchViaCheerio(targetUrl);
    parsed = parseHtmlToParsedPage(cheerioResult.rawHtml, targetUrl, cheerioResult.statusCode, cheerioResult.headers);

    if (isJsBundleRendering(cheerioResult.rawHtml, parsed)) {
      console.warn(`Cheerio output looks like a JS bundle shell for ${targetUrl}, but Browseract is disabled — returning static parse.`);
    }
  }

  // 4. Persist the successful render back into the cache for future audits.
  //    Done after parsing so a parse failure does not poison the cache.
  await setCachedRender(cacheKey, parsed);

  return { parsedPage: parsed, cacheHit: false };
}

