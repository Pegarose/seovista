import { test, expect } from "@playwright/test";
import { XMLParser } from "fast-xml-parser";

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

for (const route of launchRoutes) {
  test(`route ${route.path} has correct metadata and canonical`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator("meta[name='description']")).toHaveAttribute("content", route.description);

    const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
    expect(canonical).toBe(`https://seovista.com${route.path}`);

    const ogUrl = await page.locator("meta[property='og:url']").getAttribute("content");
    expect(ogUrl).toBe(`https://seovista.com${route.path}`);

    const h1Count = await page.locator("main h1").count();
    expect(h1Count).toBe(1);
  });
}

for (const route of launchRoutes.slice(1)) {
  test(`unslashed ${route.path.slice(0, -1)} returns 301 to trailing slash`, async ({ request }) => {
    const response = await request.get(route.path.slice(0, -1), { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    const location = response.headers()["location"];
    expect(location).toBe(`https://seovista.com${route.path}`);
  });
}

test("robots.txt returns 200 text/plain with correct sitemap and disallowed prefixes", async ({ request }) => {
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

test("sitemap.xml returns 200 with exactly 12 approved routes", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/xml");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(body);
  const urls = parsed.urlset.url as Array<{ loc: string }>;
  expect(urls).toHaveLength(12);
  const locations = urls.map((u) => u.loc);
  for (const route of launchRoutes) {
    expect(locations).toContain(`https://seovista.com${route.path}`);
  }
  expect(locations).not.toContain("https://seovista.com/api/");
  expect(locations).not.toContain("https://seovista.com/private-audit/");
});

test("llms.txt returns 200 UTF-8 text with informational description", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  expect(body).toContain("SeoVista");
  expect(body).toContain("https://seovista.com/");
  expect(body).not.toContain("ranking factor");
  expect(body).not.toContain("guarantee");
});

test("feed.xml returns 200 well-formed Atom with empty entries", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/atom+xml");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await response.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(body);
  expect(parsed.feed.title).toBe("SeoVista Insights");
  expect(parsed.feed.link).toContainEqual(expect.objectContaining({ "@_href": "https://seovista.com/feed.xml", "@_rel": "self" }));
});

test("manifest.webmanifest returns 200 parseable JSON with required fields", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const body = await response.text();
  const manifest = JSON.parse(body) as Record<string, unknown>;
  expect(manifest.name).toBe("SeoVista");
  expect(manifest.short_name).toBe("SeoVista");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
});

test("root HTML links to manifest.webmanifest", async ({ page }) => {
  await page.goto("/");
  const manifestLink = await page.locator("link[rel='manifest']").getAttribute("href");
  expect(manifestLink).toBe("/manifest.webmanifest");
});

test("forbidden routes return 404", async ({ request }) => {
  const forbidden = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/", "/unknown-route/"];
  for (const path of forbidden) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  }
});

test("JSON-LD graph contains Organization and WebSite on root", async ({ page }) => {
  await page.goto("/");
  const jsonLd = await page.locator("script[type='application/ld+json']").textContent();
  expect(jsonLd).toBeTruthy();
  const graph = JSON.parse(jsonLd!) as { "@graph": Array<Record<string, unknown>> };
  const types = graph["@graph"].map((node) => node["@type"]);
  expect(types).toContain("Organization");
  expect(types).toContain("WebSite");
  expect(types).toContain("WebPage");
});

test("service route JSON-LD contains Service and BreadcrumbList", async ({ page }) => {
  await page.goto("/geo/");
  const jsonLd = await page.locator("script[type='application/ld+json']").textContent();
  expect(jsonLd).toBeTruthy();
  const graph = JSON.parse(jsonLd!) as { "@graph": Array<Record<string, unknown>> };
  const types = graph["@graph"].map((node) => node["@type"]);
  expect(types).toContain("Service");
  expect(types).toContain("BreadcrumbList");
  expect(types).toContain("WebPage");
});

test("about route JSON-LD contains Brand", async ({ page }) => {
  await page.goto("/about/");
  const jsonLd = await page.locator("script[type='application/ld+json']").textContent();
  expect(jsonLd).toBeTruthy();
  const graph = JSON.parse(jsonLd!) as { "@graph": Array<Record<string, unknown>> };
  const types = graph["@graph"].map((node) => node["@type"]);
  expect(types).toContain("Brand");
  expect(types).toContain("WebPage");
});
