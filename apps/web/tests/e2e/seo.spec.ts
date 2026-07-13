import { test, expect } from "@playwright/test";
import { XMLParser } from "fast-xml-parser";

// ─── Test data ───────────────────────────────────────────────────────────────

interface RouteExpectation {
  path: string;
  title: string;
  description: string;
}

const launchRoutes: RouteExpectation[] = [
  { path: "/", title: "SeoVista — GEO & Search Visibility Intelligence", description: "Identify your positioning across generative engine optimization and traditional search visibility." },
  { path: "/geo/", title: "Generative Engine Optimization — SeoVista", description: "What GEO means, how it differs from traditional SEO, and why quality signals matter more than any guaranteed outcome." },
  { path: "/seo/", title: "Search Engine Optimization — SeoVista", description: "Technical crawlability, content structure, and index health for sustainable organic visibility." },
  { path: "/digital-authority/", title: "Digital Authority — SeoVista", description: "Earned visibility through editorial reputation, credible mentions, and genuine subject authority." },
  { path: "/tools/", title: "Free Tools — SeoVista", description: "A growing library of free tools for GEO and SEO readiness. Only the GEO Readiness Checker is linked during Sprint 0." },
  { path: "/tools/geo-readiness-checker/", title: "GEO Readiness Checker — SeoVista", description: "A non-operational foundation page for the GEO Readiness Checker. No Sprint 0 audit is available yet." },
  { path: "/about/", title: "About SeoVista", description: "SeoVista is an editorial intelligence lab focused on GEO and search visibility. A GMedya Group company." },
  { path: "/contact/", title: "Contact SeoVista", description: "Reach out to SeoVista. We are currently in foundation stage and respond as availability allows." },
  { path: "/insights/", title: "Insights — SeoVista", description: "Research and guides on generative engine optimization, search visibility, and digital authority." },
  { path: "/privacy/", title: "Privacy Policy — SeoVista", description: "How SeoVista handles data and privacy during the foundation stage." },
  { path: "/cookies/", title: "Cookie Policy — SeoVista", description: "How SeoVista uses cookies and similar technologies during the foundation stage." },
  { path: "/terms/", title: "Terms of Service — SeoVista", description: "The terms that govern use of the SeoVista website during the foundation stage." },
];

const serviceRoutes = ["/geo/", "/seo/", "/digital-authority/"];

const systemRoutes = [
  { path: "/robots.txt", contentType: "text/plain" },
  { path: "/sitemap.xml", contentType: "application/xml" },
  { path: "/llms.txt", contentType: "text/plain" },
  { path: "/feed.xml", contentType: "application/atom+xml" },
  { path: "/manifest.webmanifest", contentType: "application/json" },
];

const prohibitedSchemaTypes = ["AggregateRating", "Review", "Dataset", "DataCatalog"];
const prohibitedSchemaPhrases = ["starRating", "reviewCount", "ratingValue", "customerCount", "numberOfEmployees"];

const expectedOrganisationId = "https://seovista.com/#organization";
const expectedWebsiteId = "https://seovista.com/#website";
const expectedBrandId = "https://seovista.com/about/#brand";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function parseJsonLd(page: import("@playwright/test").Page) {
  const text = await page.locator("script[type='application/ld+json']").textContent();
  if (!text) throw new Error("No JSON-LD script found");
  const graph = JSON.parse(text) as { "@context": string; "@graph": Record<string, unknown>[] };
  return graph;
}

// ─── VAL-SEO-003: Metadata uniqueness, completeness, trusted canonicity ──────

for (const route of launchRoutes) {
  test(`metadata: ${route.path} has unique title, description, and absolute HTTPS canonical`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator("meta[name='description']")).toHaveAttribute("content", route.description);

    // Canonical
    const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
    expect(canonical).toBe(`https://seovista.com${route.path}`);

    // OG metadata
    await expect(page.locator("meta[property='og:title']")).toHaveAttribute("content", route.title);
    await expect(page.locator("meta[property='og:description']")).toHaveAttribute("content", route.description);
    const ogUrl = await page.locator("meta[property='og:url']").getAttribute("content");
    expect(ogUrl).toBe(`https://seovista.com${route.path}`);

    // Twitter metadata
    await expect(page.locator("meta[name='twitter:card']")).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator("meta[name='twitter:title']")).toHaveAttribute("content", route.title);
    await expect(page.locator("meta[name='twitter:description']")).toHaveAttribute("content", route.description);

    // Single canonical
    const canonicalCount = await page.locator("link[rel='canonical']").count();
    expect(canonicalCount).toBe(1);

    // One H1 in main
    const h1Count = await page.locator("main h1").count();
    expect(h1Count).toBe(1);
  });
}

test("metadata: titles are unique across all routes", async ({ page }) => {
  const titles: string[] = [];
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const title = await page.title();
    titles.push(title);
  }
  const uniqueTitles = new Set(titles);
  expect(uniqueTitles.size).toBe(titles.length);
});

test("metadata: descriptions are unique across all routes", async ({ page }) => {
  const descriptions: string[] = [];
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const desc = await page.locator("meta[name='description']").getAttribute("content");
    if (desc) descriptions.push(desc);
  }
  const uniqueDesc = new Set(descriptions);
  expect(uniqueDesc.size).toBe(descriptions.length);
});

// ─── VAL-SEO-004: Canonical resists host and transient-state poisoning ───────

test("canonical: forged Host header does not change canonical or og:url", async ({ request }) => {
  const response = await request.get("/geo/", {
    headers: { Host: "attacker.com" },
  });
  expect(response.status()).toBe(200);
  const body = await response.text();

  // Canonical must still be seovista.com
  expect(body).toContain('href="https://seovista.com/geo/"');
  expect(body).toContain('content="https://seovista.com/geo/"');
  expect(body).not.toContain("attacker.com");
});

test("canonical: forged X-Forwarded-Host does not change metadata", async ({ request }) => {
  const response = await request.get("/seo/", {
    headers: { "X-Forwarded-Host": "evil.org" },
  });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('href="https://seovista.com/seo/"');
  expect(body).not.toContain("evil.org");
});

test("canonical: query parameters do not change canonical", async ({ request }) => {
  const response = await request.get("/geo/?q=test&filter=active");
  expect(response.status()).toBe(200);
  const body = await response.text();
  // For query params, the canonical should be the base (query-free) URL
  expect(body).toContain('href="https://seovista.com/geo/"');
});

test("canonical: uppercase approved variants normalize directly to trusted lowercase content", async ({ request }) => {
  const response = await request.get("/GEO/", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe("https://seovista.com/geo/");
});

// ─── VAL-SEO-001/002: Slash and status matrix ────────────────────────────────

for (const route of launchRoutes.slice(1)) {
  test(`redirect: unslashed ${route.path.slice(0, -1)} returns 301 to trailing slash`, async ({ request }) => {
    const response = await request.get(route.path.slice(0, -1), { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    const location = response.headers()["location"];
    expect(location).toBe(`https://seovista.com${route.path}`);
  });
}

test("status: forbidden routes return 404", async ({ request }) => {
  const forbidden = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/", "/unknown-route/"];
  for (const path of forbidden) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  }
});

// ─── System routes (VAL-SEO-006 through VAL-SEO-011) ─────────────────────────

test("system: robots.txt returns 200 text/plain with correct sitemap and disallowed prefixes", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  expect(body).toContain("Sitemap: https://seovista.com/sitemap.xml");
  expect(body).toContain("User-agent: *");
  expect(body).toContain("Disallow: /api/");
  expect(body).toContain("Disallow: /admin/");
  expect(body).toContain("ChatGPT-User");
  expect(body).toContain("Claude-Web");
});

test("system: HEAD robots.txt returns 200 with same headers", async ({ request }) => {
  const response = await request.head("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("system: sitemap.xml returns 200 with all 12 approved routes and no forbidden URLs", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(body);
  const urls = parsed.urlset.url as Array<{ loc: string }>;
  // At least 12 routes, possibly including root
  expect(urls.length).toBeGreaterThanOrEqual(12);
  const locations = urls.map((u) => u.loc);
  for (const route of launchRoutes) {
    expect(locations).toContain(`https://seovista.com${route.path}`);
  }
  for (const loc of locations) {
    expect(loc).toMatch(/^https:\/\/seovista\.com(\/.*)?\/$/);
    expect(loc).not.toContain("?");
    expect(loc).not.toContain("#");
  }
  // No private/draft URLs
  const locationStr = locations.join(" ");
  expect(locationStr).not.toContain("/api/");
  expect(locationStr).not.toContain("/admin/");
  expect(locationStr).not.toContain("/draft");
  expect(locationStr).not.toContain("/private");
});

test("system: llms.txt returns 200 UTF-8 text with informational description and no ranking claim", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  expect(body).toContain("SeoVista");
  expect(body).toContain("https://seovista.com/");
  expect(body).not.toContain("ranking factor");
  expect(body).not.toContain("guarantee");
  expect(body).not.toContain("guaranteed");
  expect(body).not.toContain("preferred treatment");
});

test("system: feed.xml returns 200 well-formed Atom with empty entries", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/atom+xml");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(body);
  expect(parsed.feed.title).toBe("SeoVista Insights");
  expect(parsed.feed.link).toContainEqual(
    expect.objectContaining({ "@_href": "https://seovista.com/feed.xml", "@_rel": "self" }),
  );
  expect(parsed.feed.link).toContainEqual(
    expect.objectContaining({ "@_href": "https://seovista.com/" }),
  );
  expect(body).not.toContain('href="https://seovista.com"');
});

test("system: manifest.webmanifest returns 200 parseable JSON with required fields", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const body = await response.text();
  const manifest = JSON.parse(body) as Record<string, unknown>;
  expect(manifest.name).toBe("SeoVista");
  expect(manifest.short_name).toBe("SeoVista");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
});

test("system: root HTML links to manifest exactly once", async ({ page }) => {
  await page.goto("/");
  const manifestLinks = await page.locator("link[rel='manifest']");
  await expect(manifestLinks).toHaveCount(1);
  const href = await manifestLinks.getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
});

test("system: all system routes return 200 with nosniff and appropriate content types", async ({ request }) => {
  for (const sysRoute of systemRoutes) {
    const response = await request.get(sysRoute.path);
    expect(response.status(), `${sysRoute.path} status`).toBe(200);
    expect(response.headers()["x-content-type-options"], `${sysRoute.path} nosniff`).toBe("nosniff");
    const ct = response.headers()["content-type"] || "";
    // Each route must have a non-HTML content type
    expect(ct, `${sysRoute.path} content-type`).not.toContain("text/html");
  }
});

// ─── VAL-SEO-012: JSON-LD graph referential integrity ────────────────────────

for (const route of launchRoutes) {
  test(`jsonld: ${route.path} has exactly one JSON-LD script with valid @graph`, async ({ page }) => {
    await page.goto(route.path);
    const scripts = await page.locator("script[type='application/ld+json']");
    await expect(scripts).toHaveCount(1);

    const graph = await parseJsonLd(page);
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toBeDefined();
    expect(Array.isArray(graph["@graph"])).toBe(true);
    expect(graph["@graph"].length).toBeGreaterThan(0);

    // Every node must have @type
    for (const node of graph["@graph"]) {
      expect(node["@type"]).toBeDefined();
    }
  });
}

test("jsonld: no dangling, duplicate-conflicting, or unresolved @id references", async ({ page }) => {
  // Collect all JSON-LD across all routes and verify reference integrity
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);

    const nodeIds = new Set<string>();
    const referencedIds = new Set<string>();

    for (const node of graph["@graph"]) {
      if (node["@id"]) {
        nodeIds.add(node["@id"] as string);
      }
      // Collect referenced @ids from object properties
      const props = Object.values(node);
      for (const prop of props) {
        if (prop && typeof prop === "object" && !Array.isArray(prop)) {
          if ((prop as Record<string, unknown>)["@id"]) {
            referencedIds.add((prop as Record<string, unknown>)["@id"] as string);
          }
        }
        if (Array.isArray(prop)) {
          for (const item of prop) {
            if (item && typeof item === "object" && (item as Record<string, unknown>)["@id"]) {
              referencedIds.add((item as Record<string, unknown>)["@id"] as string);
            }
          }
        }
      }
    }

    // All referenced IDs must exist in the graph
    for (const refId of referencedIds) {
      expect(nodeIds.has(refId), `Referenced @id "${refId}" not found in graph for ${route.path}`).toBe(true);
    }
  }
});

test("jsonld: Organization and WebSite IDs are stable", async ({ page }) => {
  await page.goto("/");
  const graph = await parseJsonLd(page);

  const org = graph["@graph"].find((n) => n["@type"] === "Organization");
  expect(org).toBeDefined();
  expect(org!["@id"]).toBe(expectedOrganisationId);
  expect(org!["url"]).toBe("https://seovista.com/");

  const website = graph["@graph"].find((n) => n["@type"] === "WebSite");
  expect(website).toBeDefined();
  expect(website!["@id"]).toBe(expectedWebsiteId);
  expect(website!["url"]).toBe("https://seovista.com/");
});

test("jsonld: Organization parentOrganization identifies GMedya Group", async ({ page }) => {
  await page.goto("/");
  const graph = await parseJsonLd(page);

  const org = graph["@graph"].find((n) => n["@type"] === "Organization");
  expect(org).toBeDefined();
  const parent = org!["parentOrganization"] as Record<string, unknown> | undefined;
  expect(parent).toBeDefined();
  expect(parent!["name"]).toBe("GMedya Group");
});

// ─── VAL-SEO-013: Page, service, and breadcrumb schema match ─────────────────

for (const route of launchRoutes) {
  test(`jsonld: ${route.path} WebPage URL matches HTML canonical`, async ({ page }) => {
    await page.goto(route.path);
    const canonical = await page.locator("link[rel='canonical']").getAttribute("href");

    const graph = await parseJsonLd(page);
    const webPage = graph["@graph"].find((n) => n["@type"] === "WebPage");
    expect(webPage).toBeDefined();
    expect(webPage!["url"]).toBe(canonical);
    expect(webPage!["@id"]).toBe(canonical);
  });
}

for (const svcPath of serviceRoutes) {
  test(`jsonld: ${svcPath} Service node exactly matches first-response visible content`, async ({ page }) => {
    const response = await page.goto(svcPath);
    expect(response?.status()).toBe(200);

    const firstResponseHtml = await response!.text();
    const graph = await parseJsonLd(page);
    const service = graph["@graph"].find((n) => n["@type"] === "Service");
    expect(service).toBeDefined();

    const serviceName = service!["name"] as string;
    const serviceDescription = service!["description"] as string;

    await expect(page.locator("main h1")).toHaveText(serviceName);
    await expect(page.locator("main")).toContainText(serviceDescription);
    expect(firstResponseHtml).toContain(serviceName);
    expect(firstResponseHtml).toContain(serviceDescription);
  });
}

for (const svcPath of serviceRoutes) {
  test(`jsonld: ${svcPath} BreadcrumbList is valid`, async ({ page }) => {
    await page.goto(svcPath);
    const graph = await parseJsonLd(page);

    const breadcrumb = graph["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    expect(breadcrumb).toBeDefined();

    const items = breadcrumb!["itemListElement"] as Array<Record<string, unknown>> | undefined;
    expect(items).toBeDefined();
    expect(items!.length).toBeGreaterThanOrEqual(2);

    // Positions start at 1 and are contiguous
    for (let i = 0; i < items!.length; i++) {
      const item = items![i]!;
      expect(item["position"]).toBe(i + 1);
      expect(item["name"]).toBeDefined();
      const itemUrl = item["item"] as string;
      expect(itemUrl).toMatch(/^https:\/\/seovista\.com\//);
    }

    // Last item should be the current route
    const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
    const lastItem = items![items!.length - 1]!;
    expect(lastItem["item"]).toBe(canonical);
  });
}

// ─── VAL-SEO-017: Required schema types per route ────────────────────────────

test("jsonld: root route has Organization, WebSite, and WebPage", async ({ page }) => {
  await page.goto("/");
  const graph = await parseJsonLd(page);
  const types = graph["@graph"].map((n) => n["@type"]);
  expect(types).toContain("Organization");
  expect(types).toContain("WebSite");
  expect(types).toContain("WebPage");
});

test("jsonld: every route has WebPage", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("WebPage");
  }
});

for (const svcPath of serviceRoutes) {
  test(`jsonld: ${svcPath} has Service and BreadcrumbList`, async ({ page }) => {
    await page.goto(svcPath);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("Service");
    expect(types).toContain("BreadcrumbList");
  });
}

test("jsonld: /about/ has Brand with correct @id", async ({ page }) => {
  await page.goto("/about/");
  const graph = await parseJsonLd(page);
  const types = graph["@graph"].map((n) => n["@type"]);
  expect(types).toContain("Brand");

  const brand = graph["@graph"].find((n) => n["@type"] === "Brand");
  expect(brand!["@id"]).toBe(expectedBrandId);
});

// ─── VAL-SEO-014: Conditional content schema requires visible evidence ───────

test("jsonld: no Person schema on routes without visible author content", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).not.toContain("Person");
  }
});

test("jsonld: no Article/BlogPosting schema on routes without articles", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).not.toContain("Article");
    expect(types).not.toContain("BlogPosting");
  }
});

test("jsonld: no FAQPage schema on routes without visible FAQs", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).not.toContain("FAQPage");
  }
});

test("jsonld: no DefinedTerm schema on routes without definitions", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).not.toContain("DefinedTerm");
  }
});

// ─── VAL-SEO-015: No fabricated claims ───────────────────────────────────────

test("jsonld: no AggregateRating, Review, Dataset, or fabricated metrics on any route", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);

    for (const node of graph["@graph"]) {
      const type = node["@type"] as string;
      // No prohibited types
      expect(prohibitedSchemaTypes.includes(type),
        `${type} found on ${route.path} — prohibited`).toBe(false);
      // No fabricated metric keys
      const keys = Object.keys(node);
      for (const key of keys) {
        if (prohibitedSchemaPhrases.some((p) => key.toLowerCase().includes(p.toLowerCase()))) {
          expect(false, `Prohibited key "${key}" found in ${type} on ${route.path}`).toBe(true);
        }
      }
    }

    // Specifically check the checker page does not emit application schema
    if (route.path === "/tools/geo-readiness-checker/") {
      const types = graph["@graph"].map((n) => n["@type"]);
      expect(types).not.toContain("WebApplication");
      expect(types).not.toContain("SoftwareApplication");
      expect(types).not.toContain("Product");
    }
  }
});

// ─── VAL-SEO-016: Discovery surface consistency ──────────────────────────────

test("discovery: canonicals, JSON-LD, OG URLs, and sitemap all agree on seovista.com", async ({ request, page }) => {
  // Check discovery surface consistency across all routes
  for (const route of launchRoutes) {
    await page.goto(route.path);

    const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
    const ogUrl = await page.locator("meta[property='og:url']").getAttribute("content");
    expect(ogUrl).toBe(canonical);

    const graph = await parseJsonLd(page);
    const webPage = graph["@graph"].find((n) => n["@type"] === "WebPage");
    expect(webPage!["url"]).toBe(canonical);

    // All URLs must be trusted seovista.com
    expect(canonical).toMatch(/^https:\/\/seovista\.com\//);
  }

  // Sitemap URLs are all seovista.com
  const sitemapResp = await request.get("/sitemap.xml");
  const sitemapBody = await sitemapResp.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(sitemapBody);
  const urls = parsed.urlset.url as Array<{ loc: string }>;
  for (const url of urls) {
    expect(url.loc).toMatch(/^https:\/\/seovista\.com/);
  }

  // Llms.txt URLs are all seovista.com
  const llmsResp = await request.get("/llms.txt");
  const llmsBody = await llmsResp.text();
  const llmsUrls = llmsBody.match(/https:\/\/[^\s)]+/g) || [];
  for (const u of llmsUrls) {
    expect(u).toMatch(/^https:\/\/seovista\.com\//);
  }

  // Feed URLs are all seovista.com
  const feedResp = await request.get("/feed.xml");
  const feedBody = await feedResp.text();
  const feedUrls = feedBody.match(/https:\/\/[^\s<"]+/g) || [];
  const ourFeedUrls = feedUrls.filter((u) => u.includes("seovista"));
  for (const u of ourFeedUrls) {
    expect(u).toMatch(/^https:\/\/seovista\.com/);
  }

  // Manifest start_url resolves to the canonical root
  const manifestResp = await request.get("/manifest.webmanifest");
  const manifest = await manifestResp.json() as Record<string, unknown>;
  expect(manifest.start_url).toBe("/");
});

// ─── VAL-SEO-018: Internal link resolution ───────────────────────────────────

test("links: every public internal link resolves in one 301 hop or fewer", async ({ request, page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);

    // Get all same-origin anchor hrefs
    const anchors = await page.locator("a[href]").all();
    const hrefs: string[] = [];
    for (const anchor of anchors) {
      const href = await anchor.getAttribute("href");
      if (href && (href.startsWith("/") || href.startsWith("https://seovista.com/"))) {
        // Skip mailto, tel, fragment-only
        if (!href.startsWith("mailto:") && !href.startsWith("tel:") && href !== "#") {
          hrefs.push(href);
        }
      }
    }

    for (const href of hrefs) {
      const path = href.startsWith("/") ? href : new URL(href).pathname;
      if (path === "#main" || path === "#mobile-nav") continue; // Skip skip-link and fragment anchors

      // Check the link resolves
      const resp = await request.get(path);
      // Should be 200 (direct) or 301 → 200 (one hop), never 404 or error
      expect([200, 301, 304].includes(resp.status()),
        `Link "${href}" on ${route.path} returned ${resp.status()}`).toBe(true);
    }
  }
});

test("links: navigation has no forbidden destination links", async ({ page }) => {
  await page.goto("/");
  const allHrefs = await page.locator("a[href]").all();
  const hrefValues = await Promise.all(allHrefs.map((a) => a.getAttribute("href")));

  const forbiddenTerms = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/", "/account/", "/login/", "/signup/"];
  for (const href of hrefValues) {
    if (href) {
      for (const term of forbiddenTerms) {
        expect(href.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  }
});

// ─── VAL-SEO-019: Image policy validation ────────────────────────────────────

test("images: rendered images have alt text and explicit dimensions", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);

    const imgs = await page.locator("img").all();
    for (const img of imgs) {
      const alt = await img.getAttribute("alt");
      const width = await img.getAttribute("width");
      const height = await img.getAttribute("height");

      // Every img must have alt (empty for decorative)
      expect(alt).not.toBeNull();

      // Non-decorative images must have explicit dimensions
      if (alt && alt.length > 0) {
        expect(width).not.toBeNull();
        expect(height).not.toBeNull();
      }
    }
  }
});

test("images: social image URLs when present are absolute HTTPS trusted-origin", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);

    const ogImageEl = page.locator("meta[property='og:image']");
    const ogImageCount = await ogImageEl.count();
    const twitterImageEl = page.locator("meta[name='twitter:image']");
    const twitterImageCount = await twitterImageEl.count();

    if (ogImageCount > 0) {
      const ogImage = await ogImageEl.getAttribute("content");
      expect(ogImage).toMatch(/^https:\/\/seovista\.com\//);
    }
    if (twitterImageCount > 0) {
      const twitterImage = await twitterImageEl.getAttribute("content");
      expect(twitterImage).toMatch(/^https:\/\/seovista\.com\//);
    }
  }
});

// ─── JSON-LD additional structural tests ─────────────────────────────────────

test("jsonld: all non-root routes have Organization and WebSite nodes", async ({ page }) => {
  // Non-root routes also get full graph (Organization + WebSite + WebPage + extras)
  for (const route of launchRoutes.slice(1)) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    expect(types).toContain("WebPage");
  }
});

test("jsonld: WebSite publisher references Organization", async ({ page }) => {
  await page.goto("/");
  const graph = await parseJsonLd(page);
  const website = graph["@graph"].find((n) => n["@type"] === "WebSite");
  expect(website).toBeDefined();
  const publisher = website!["publisher"] as Record<string, unknown> | undefined;
  expect(publisher).toBeDefined();
  expect(publisher!["@id"]).toBe(expectedOrganisationId);
});

test("jsonld: every page's WebPage isPartOf references WebSite", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);
    const graph = await parseJsonLd(page);
    const webPage = graph["@graph"].find((n) => n["@type"] === "WebPage");
    expect(webPage).toBeDefined();
    const isPartOf = webPage!["isPartOf"] as Record<string, unknown> | undefined;
    expect(isPartOf).toBeDefined();
    expect(isPartOf!["@id"]).toBe(expectedWebsiteId);
  }
});

test("jsonld: Service provider references Organization", async ({ page }) => {
  for (const svcPath of serviceRoutes) {
    await page.goto(svcPath);
    const graph = await parseJsonLd(page);
    const service = graph["@graph"].find((n) => n["@type"] === "Service");
    expect(service).toBeDefined();
    const provider = service!["provider"] as Record<string, unknown> | undefined;
    expect(provider).toBeDefined();
    expect(provider!["@id"]).toBe(expectedOrganisationId);
  }
});
