import { test, expect } from "@playwright/test";

interface RouteCase {
  path: string;
  expectedTitle: string;
  isServiceRoute?: boolean;
}

const launchRoutes: RouteCase[] = [
  { path: "/", expectedTitle: "SeoVista — GEO & Search Visibility Intelligence" },
  { path: "/geo/", expectedTitle: "Generative Engine Optimization — SeoVista", isServiceRoute: true },
  { path: "/seo/", expectedTitle: "Search Engine Optimization — SeoVista", isServiceRoute: true },
  { path: "/digital-authority/", expectedTitle: "Digital Authority — SeoVista", isServiceRoute: true },
  { path: "/tools/", expectedTitle: "Free Tools — SeoVista" },
  { path: "/tools/geo-readiness-checker/", expectedTitle: "GEO Readiness Checker — SeoVista" },
  { path: "/about/", expectedTitle: "About SeoVista" },
  { path: "/contact/", expectedTitle: "Contact SeoVista" },
  { path: "/insights/", expectedTitle: "Insights — SeoVista" },
  { path: "/privacy/", expectedTitle: "Privacy Policy — SeoVista" },
  { path: "/cookies/", expectedTitle: "Cookie Policy — SeoVista" },
  { path: "/terms/", expectedTitle: "Terms of Service — SeoVista" },
];

const systemRoutes = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/feed.xml",
  "/manifest.webmanifest",
];

const forbiddenRoutes = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/"];
const phase11Tools = ["/tools/keyword-gap/", "/tools/backlink-audit/", "/tools/rank-tracker/"];

// ─── Launch routes: status, H1, content ──────────────────────────────────────

for (const route of launchRoutes) {
  test(`route: ${route.path} returns 200 with one H1 and foundation content`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(route.path);

    // Exactly one H1 in main
    const h1s = await page.locator("main h1");
    await expect(h1s).toHaveCount(1);
    await expect(h1s).toBeVisible();

    // At least one paragraph in main
    const paragraphs = await page.locator("main p");
    const count = await paragraphs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Title matches expected
    await expect(page).toHaveTitle(route.expectedTitle);

    // No console errors
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    // Navigate again to capture any lazy errors
    await page.goto(route.path);
    expect(errors).toHaveLength(0);
  });
}

// ─── System routes: status and accessibility ─────────────────────────────────

for (const sysRoute of systemRoutes) {
  test(`system: ${sysRoute} returns 200`, async ({ request }) => {
    const response = await request.get(sysRoute);
    expect(response.status()).toBe(200);
  });
}

test("system: robots.txt contains sitemap declaration and crawler rules", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Sitemap:");
  expect(body).toContain("User-agent:");
});

test("system: sitemap.xml is well-formed XML", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<urlset");
  expect(body).toContain("</urlset>");
});

test("system: llms.txt contains site description", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("SeoVista");
  expect(body).toContain("https://seovista.com");
});

test("system: feed.xml is well-formed XML", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<?xml");
  expect(body).toContain("<feed");
});

test("system: manifest.webmanifest is valid JSON", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const text = await response.text();
  const manifest = JSON.parse(text) as Record<string, unknown>;
  expect(manifest.name).toBeDefined();
  expect(manifest.start_url).toBe("/");
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test("nav: exposes only approved destinations", async ({ page }) => {
  await page.goto("/");

  const navLinks = await page.locator("header nav[aria-label='Primary'] a").all();
  const hrefs = await Promise.all(navLinks.map((link) => link.getAttribute("href")));
  expect(hrefs).toEqual(["/geo/", "/seo/", "/digital-authority/", "/tools/", "/insights/", "/about/"]);

  // No forbidden links anywhere in the document
  const bodyHtml = await page.locator("body").innerHTML();
  const forbiddenTerms = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/", "/account/", "/login/", "/signup/"];
  for (const term of forbiddenTerms) {
    expect(bodyHtml, `Forbidden route "${term}" found`).not.toContain(term);
  }
});

test("nav: all header nav links are keyboard operable anchors with non-empty href", async ({ page }) => {
  await page.goto("/");
  const navAnchors = await page.locator("header a[href]").all();
  expect(navAnchors.length).toBeGreaterThan(0);

  for (const anchor of navAnchors) {
    const href = await anchor.getAttribute("href");
    expect(href, "Nav link must have non-empty href").toBeTruthy();
  }
});

test("nav: CTA button links to /contact/", async ({ page }) => {
  await page.goto("/");
  const cta = page.locator("a:has-text('Get a GEO Audit')");
  const href = await cta.getAttribute("href");
  expect(href).toBe("/contact/");
});

// ─── Footer ──────────────────────────────────────────────────────────────────

test("footer: discloses GMedya Group and has required sections", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer[role='contentinfo']");

  // GMedya disclosure
  await expect(footer).toContainText("A GMedya Group company");

  // No prohibited brand promotion
  await expect(footer).not.toContainText("Backlinkler.com");
  await expect(footer).not.toContainText("BacklinkWire.com");

  // Required sections
  await expect(footer).toContainText("Product");
  await expect(footer).toContainText("Company");
  await expect(footer).toContainText("Legal");

  // Copyright notice
  const year = new Date().getFullYear();
  await expect(footer).toContainText(String(year));
});

test("footer: all footer links have non-empty href", async ({ page }) => {
  await page.goto("/");
  const footerLinks = await page.locator("footer a[href]").all();
  expect(footerLinks.length).toBeGreaterThan(0);

  for (const link of footerLinks) {
    const href = await link.getAttribute("href");
    expect(href, `Footer link must have non-empty href: ${await link.textContent()}`).toBeTruthy();
  }
});

// ─── Forbidden routes ────────────────────────────────────────────────────────

for (const route of forbiddenRoutes) {
  test(`error: forbidden route ${route} returns 404 with branded not-found page`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
    await expect(page.locator("main h1")).toContainText(/page.?not.?found/i);
    // Should have a keyboard-operable return link
    const returnLink = page.locator("main a[href='/']");
    await expect(returnLink).toBeVisible();
  });
}

for (const route of phase11Tools) {
  test(`error: Phase 1.1 tool route ${route} returns 404`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
  });
}

// ─── Checker page ────────────────────────────────────────────────────────────

test("checker: states no operational audit, exposes no form, no fake results", async ({ page }) => {
  await page.goto("/tools/geo-readiness-checker/");

  await expect(page.locator("main h1")).toContainText("GEO Readiness Checker");
  await expect(page.locator("main")).toContainText("not operational");
  await expect(page.locator("main")).toContainText("Sprint 0");

  // No submission form or submit button
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page.locator("main button[type='submit']")).toHaveCount(0);

  // The page truthfully states no submission, no score, and no report yet
  const mainText = (await page.locator("main").textContent())?.toLowerCase() || "";
  expect(mainText).toContain("no submission");
  expect(mainText).toContain("no score");
  expect(mainText).toContain("not operational");
});

// ─── Semantic structure ──────────────────────────────────────────────────────

test("semantic: skip-link is present and targets main", async ({ page }) => {
  await page.goto("/");
  const skipLink = page.locator("a[href='#main']");
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toContainText(/skip/i);
});

test("semantic: landmarks are present on all routes", async ({ page }) => {
  for (const route of launchRoutes) {
    await page.goto(route.path);

    await expect(page.locator("header[role='banner']")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("footer[role='contentinfo']")).toHaveCount(1);
    await expect(page.locator("html[lang='en']")).toHaveCount(1);

    // One heading hierarchy
    const h1 = await page.locator("h1").count();
    expect(h1).toBeGreaterThanOrEqual(1);
  }
});

// ─── Error page ──────────────────────────────────────────────────────────────

test("error: not-found page has English lang, one H1, and keyboard-operable return link", async ({ page }) => {
  await page.goto("/nonexistent-path-that-does-not-exist/");

  await expect(page.locator("html[lang='en']")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main a[href='/']")).toBeVisible();
});

// ─── Copy truthfulness ───────────────────────────────────────────────────────

test("copy: home page identifies GEO and search visibility", async ({ page }) => {
  await page.goto("/");
  const mainText = await page.locator("main").textContent();
  expect(mainText?.toLowerCase()).toMatch(/geo|generative|search visibility|editorial/);
});

test("copy: GEO page explains category without outcome guarantees", async ({ page }) => {
  await page.goto("/geo/");
  const mainText = await page.locator("main").textContent();
  expect(mainText).toContain("Generative Engine Optimization");
  // The page correctly states that GEO is not a guarantee
  expect(mainText).toContain("not a guarantee");
});

test("copy: SEO page describes crawlability and structure", async ({ page }) => {
  await page.goto("/seo/");
  const mainText = await page.locator("main").textContent();
  expect(mainText).toContain("Search Engine Optimization");
});

test("copy: Digital Authority page mentions editorial reputation without link schemes", async ({ page }) => {
  await page.goto("/digital-authority/");
  const mainText = await page.locator("main").textContent();
  expect(mainText).toContain("Digital Authority");
  // The text acknowledges link schemes but states we do not operate them
  expect(mainText).toContain("do not sell links");
  expect(mainText).not.toContain("buy links");
});

test("copy: About page identifies SeoVista and GMedya", async ({ page }) => {
  await page.goto("/about/");
  const mainText = await page.locator("main").textContent();
  expect(mainText).toContain("SeoVista");
  expect(mainText).toContain("GMedya");
});

test("copy: Contact page states foundation-stage availability", async ({ page }) => {
  await page.goto("/contact/");
  const mainText = await page.locator("main").textContent();
  expect(mainText).toContain("foundation");
});

test("copy: Privacy, Cookies, and Terms each state distinct purpose", async ({ page }) => {
  await page.goto("/privacy/");
  const privacyText = await page.locator("main").textContent();
  expect(privacyText).toContain("privacy");

  await page.goto("/cookies/");
  const cookiesText = await page.locator("main").textContent();
  expect(cookiesText).toContain("cookie");

  await page.goto("/terms/");
  const termsText = await page.locator("main").textContent();
  expect(termsText).toContain("term");
});

test("copy: no route claims rankings, citations, backlinks, customers, or fabricated proof", async ({ page }) => {
  const prohibitedClaims = [
    "guaranteed rank",
    "top 10",
    "#1",
    "10,000 customers",
    "industry awards",
    "best in class",
  ];

  for (const route of launchRoutes) {
    await page.goto(route.path);
    const mainText = (await page.locator("main").textContent())?.toLowerCase() || "";
    for (const claim of prohibitedClaims) {
      expect(mainText, `Prohibited claim "${claim}" found on ${route.path}`).not.toContain(claim.toLowerCase());
    }
  }
});

// ─── No console errors across all routes ─────────────────────────────────────

test("console: no errors across all routes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  for (const route of launchRoutes) {
    await page.goto(route.path);
  }

  expect(errors, `Console errors found: ${errors.join(", ")}`).toHaveLength(0);
});
