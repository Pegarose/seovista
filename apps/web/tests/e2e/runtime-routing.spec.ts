import { expect, test } from "@playwright/test";

const approvedRoutes = [
  "/geo/",
  "/seo/",
  "/digital-authority/",
  "/tools/",
  "/tools/geo-readiness-checker/",
  "/about/",
  "/contact/",
  "/insights/",
  "/privacy/",
  "/cookies/",
  "/terms/",
];

const forbiddenRoutes = [
  "/platform/",
  "/pricing/",
  "/case-studies/",
  "/dashboard/",
  "/tools/keyword-gap/",
  "/tools/backlink-audit/",
  "/tools/rank-tracker/",
  "/unknown-route/",
];

const expectedSecurityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

function testRuntimeHeaders(expectHsts: boolean): void {
  test("applies the shared security-header policy to an approved route", async ({ request }) => {
    const response = await request.get("/geo/");
    expect(response.status()).toBe(200);

    for (const [header, value] of Object.entries(expectedSecurityHeaders)) {
      expect(response.headers()[header]).toBe(value);
    }

    expect(response.headers()["strict-transport-security"])[expectHsts ? "toBe" : "toBeUndefined"](
      expectHsts ? "max-age=31536000; includeSubDomains; preload" : undefined,
    );
  });
}

function testRoutingMatrix(redirectStatus: number, redirectLocation: (path: string) => string): void {
  for (const route of approvedRoutes) {
    test(`serves ${route} and redirects its unslashed counterpart`, async ({ request }) => {
      const finalResponse = await request.get(route, { maxRedirects: 0 });
      expect(finalResponse.status()).toBe(200);

      const unslashed = route.slice(0, -1);
      const redirectResponse = await request.get(unslashed, { maxRedirects: 0 });
      expect(redirectResponse.status()).toBe(redirectStatus);
      expect(redirectResponse.headers().location).toBe(redirectLocation(route));
    });
  }

  for (const route of forbiddenRoutes) {
    test(`keeps forbidden route ${route} as a 404`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 });
      expect(response.status()).toBe(404);
    });
  }
}

const runtime = process.env.WEB_TEST_RUNTIME ?? "production";

if (runtime === "development") {
  testRuntimeHeaders(false);
  testRoutingMatrix(308, (route) => route);
} else {
  testRuntimeHeaders(true);
  testRoutingMatrix(301, (route) => `https://seovista.com${route}`);

  test("applies the shared security-header policy to production slash redirects", async ({ request }) => {
    const response = await request.get("/geo", { maxRedirects: 0 });
    expect(response.status()).toBe(301);

    for (const [header, value] of Object.entries(expectedSecurityHeaders)) {
      expect(response.headers()[header]).toBe(value);
    }
    expect(response.headers()["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains; preload");
  });
}
