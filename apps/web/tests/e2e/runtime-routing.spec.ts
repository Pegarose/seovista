import { expect, test } from "@playwright/test";

const trustedOrigin = "https://seovista.com";

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

function testRuntimeHeaders(): void {
  test("applies the shared security-header policy to an approved route", async ({ request }, testInfo) => {
    const response = await request.get("/geo/");
    expect(response.status()).toBe(200);

    for (const [header, value] of Object.entries(expectedSecurityHeaders)) {
      expect(response.headers()[header]).toBe(value);
    }

    const expectHsts = testInfo.project.name === "production-routing";
    expect(response.headers()["strict-transport-security"])[expectHsts ? "toBe" : "toBeUndefined"](
      expectHsts ? "max-age=31536000; includeSubDomains; preload" : undefined,
    );
  });
}

function testRoutingMatrix(): void {
  test("serves the root directly for GET and HEAD", async ({ request }) => {
    for (const method of ["get", "head"] as const) {
      const response = await request[method]("/", { maxRedirects: 0 });
      expect(response.status()).toBe(200);
    }
  });

  for (const route of approvedRoutes) {
    test(`serves ${route} directly for GET and HEAD`, async ({ request }) => {
      for (const method of ["get", "head"] as const) {
        const response = await request[method](route, { maxRedirects: 0 });
        expect(response.status()).toBe(200);
      }
    });

    test(`normalizes ${route.slice(0, -1)} to one absolute trusted 301`, async ({ request }) => {
      for (const method of ["get", "head"] as const) {
        const response = await request[method](route.slice(0, -1), { maxRedirects: 0 });
        expect(response.status()).toBe(301);
        expect(response.headers().location).toBe(`${trustedOrigin}${route}`);
      }
    });
  }

  test("uses only the trusted lowercase query-free target for normalized routes", async ({ request }) => {
    const response = await request.get("/GEO?campaign=untrusted", {
      headers: { Host: "attacker.invalid", "X-Forwarded-Host": "proxy.invalid" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`${trustedOrigin}/geo/`);
  });

  test("normalizes uppercase approved slash routes in one trusted 301", async ({ request }) => {
    const response = await request.get("/TOOLS/GEO-READINESS-CHECKER/", { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`${trustedOrigin}/tools/geo-readiness-checker/`);
  });

  for (const route of forbiddenRoutes) {
    for (const path of [route, route.slice(0, -1), route.toUpperCase()]) {
      test(`keeps ${path} as a direct 404`, async ({ request }) => {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status()).toBe(404);
        expect(response.status()).not.toBe(308);
      });
    }
  }
}

testRuntimeHeaders();
testRoutingMatrix();

test("applies shared security headers to slash redirects", async ({ request }, testInfo) => {
  const response = await request.get("/geo", { maxRedirects: 0 });
  expect(response.status()).toBe(301);

  for (const [header, value] of Object.entries(expectedSecurityHeaders)) {
    expect(response.headers()[header]).toBe(value);
  }

  if (testInfo.project.name === "production-routing") {
    expect(response.headers()["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains; preload");
  } else {
    expect(response.headers()["strict-transport-security"]).toBeUndefined();
  }
});
