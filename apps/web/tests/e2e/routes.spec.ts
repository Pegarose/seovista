import { test, expect } from "@playwright/test";

interface RouteCase {
  path: string;
  expectedTitle: string;
}

const launchRoutes: RouteCase[] = [
  { path: "/", expectedTitle: "SeoVista — GEO & Search Visibility Intelligence" },
  { path: "/geo/", expectedTitle: "Generative Engine Optimization — SeoVista" },
  { path: "/seo/", expectedTitle: "Search Engine Optimization — SeoVista" },
  { path: "/digital-authority/", expectedTitle: "Digital Authority — SeoVista" },
  { path: "/tools/", expectedTitle: "Free Tools — SeoVista" },
  { path: "/tools/geo-readiness-checker/", expectedTitle: "GEO Readiness Checker — SeoVista" },
  { path: "/about/", expectedTitle: "About SeoVista" },
  { path: "/contact/", expectedTitle: "Contact SeoVista" },
  { path: "/insights/", expectedTitle: "Insights — SeoVista" },
  { path: "/privacy/", expectedTitle: "Privacy Policy — SeoVista" },
  { path: "/cookies/", expectedTitle: "Cookie Policy — SeoVista" },
  { path: "/terms/", expectedTitle: "Terms of Service — SeoVista" },
];

const forbiddenRoutes = ["/platform/", "/pricing/", "/case-studies/", "/dashboard/"];

const phase11Tools = ["/tools/keyword-gap/", "/tools/backlink-audit/", "/tools/rank-tracker/"];

for (const route of launchRoutes) {
  test(`route ${route.path} returns 200 with one H1 and foundation content`, async ({ page }) => {
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(route.path);

    const h1s = await page.locator("main h1").count();
    expect(h1s).toBe(1);

    await expect(page.locator("main h1")).toBeVisible();
    const paragraphCount = await page.locator("main p").count();
    expect(paragraphCount).toBeGreaterThanOrEqual(1);

    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    expect(errors).toHaveLength(0);
  });
}

test("navigation exposes only approved destinations and no forbidden routes", async ({ page }) => {
  await page.goto("/");

  const navLinks = await page.locator("header nav[aria-label='Primary'] a").all();
  const hrefs = await Promise.all(navLinks.map((link) => link.getAttribute("href")));
  expect(hrefs).toEqual(["/geo/", "/seo/", "/digital-authority/", "/tools/", "/insights/", "/about/"]);

  const bodyHtml = await page.locator("body").innerHTML();
  const forbiddenTerms = ["Platform", "Pricing", "Case Studies", "Dashboard", "Account", "/login", "/signup"];
  for (const term of forbiddenTerms) {
    expect(bodyHtml).not.toContain(term);
  }
});

test("footer discloses GMedya Group and does not promote Backlinkler or BacklinkWire", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer[role='contentinfo']");
  await expect(footer).toContainText("A GMedya Group company");
  await expect(footer).not.toContainText("Backlinkler.com");
  await expect(footer).not.toContainText("BacklinkWire.com");
});

for (const route of forbiddenRoutes) {
  test(`forbidden route ${route} returns 404 with branded not-found page`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
    await expect(page.locator("main h1")).toContainText("Page not found");
    await expect(page.locator("main a[href='/']")).toBeVisible();
  });
}

for (const route of phase11Tools) {
  test(`phase 1.1 tool route ${route} returns 404`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
  });
}

test("checker page states no operational audit and exposes no form", async ({ page }) => {
  await page.goto("/tools/geo-readiness-checker/");
  await expect(page.locator("main h1")).toContainText("GEO Readiness Checker");
  await expect(page.locator("main")).toContainText("Not operational in Sprint 0");
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page.locator("main button[type='submit']")).toHaveCount(0);
});

test("skip-link is present and targets main", async ({ page }) => {
  await page.goto("/");
  const skipLink = page.locator("a[href='#main']");
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toContainText("Skip to main content");
});

test("semantic landmarks are present on home page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header[role='banner']")).toHaveCount(1);
  await expect(page.locator("nav[aria-label='Primary']")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("footer[role='contentinfo']")).toHaveCount(1);
});
