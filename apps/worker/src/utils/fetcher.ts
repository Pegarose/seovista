import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { type ParsedPage } from "@seovista/geo-engine";

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
 * Fetches the HTML content of a given URL and parses it into the structure expected by the Geo-Engine.
 * 
 * @param targetUrl The URL of the page to fetch and analyze.
 * @returns A Promise resolving to a strongly-typed `ParsedPage`.
 */
export async function fetchAndParseUrl(targetUrl: string): Promise<ParsedPage> {
  // 1. Validate against SSRF
  await validateSSRF(targetUrl);

  const requestUrl = new URL(targetUrl);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  // 2. Execute GET Request
  const response = await fetch(requestUrl.toString(), {
    headers: {
      "User-Agent": "SeoVista Crawler/1.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    }
  });

  const rawHtml = await response.text();
  const statusCode = response.status;
  
  // Convert Headers object to plain Record
  const headersRecord: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headersRecord[key.toLowerCase()] = value;
  });

  // 3. Parse HTML
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
      } catch (err) {
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
  // Create a copy of the body to strip tags off safely 
  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript, iframe, svg").remove();
  const textContent = bodyClone.text().replace(/\s+/g, ' ').trim();

  // Construct return object avoiding undefined assignments for exactOptionalPropertyTypes
  const parsedPage: ParsedPage = {
    statusCode,
    headers: headersRecord,
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
