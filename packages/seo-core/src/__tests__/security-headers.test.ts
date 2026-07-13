import { describe, expect, it } from "vitest";
import {
  buildCsp,
  buildHsts,
  buildSecurityHeaders,
  nextSecurityHeaders,
} from "../security/headers";

describe("buildCsp", () => {
  it("disables objects", () => {
    const csp = buildCsp();
    expect(csp).toContain("object-src 'none'");
  });

  it("restricts frame ancestors", () => {
    const csp = buildCsp();
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("does not contain wildcard script sources", () => {
    const csp = buildCsp();
    expect(csp).not.toContain("*");
  });

  it("does not contain unsafe-eval", () => {
    const csp = buildCsp();
    expect(csp).not.toContain("unsafe-eval");
  });

  it("includes approved origins in connect-src", () => {
    const csp = buildCsp({ approvedOrigins: ["https://api.seovista.com"] });
    expect(csp).toContain("connect-src 'self' https://api.seovista.com");
  });
});

describe("buildHsts", () => {
  it("emits a durable max-age with subdomain policy", () => {
    const hsts = buildHsts();
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).toContain("includeSubDomains");
  });
});

describe("buildSecurityHeaders", () => {
  it("includes CSP, nosniff, referrer, and frame policy", () => {
    const headers = buildSecurityHeaders({ hsts: false });
    const keys = headers.map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-Frame-Options");
  });

  it("omits HSTS when disabled", () => {
    const headers = buildSecurityHeaders({ hsts: false });
    const keys = headers.map((h) => h.key);
    expect(keys).not.toContain("Strict-Transport-Security");
  });

  it("includes HSTS when enabled", () => {
    const headers = buildSecurityHeaders({ hsts: true });
    const keys = headers.map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
  });

  it("does not include secrets in header values", () => {
    const headers = buildSecurityHeaders();
    for (const header of headers) {
      expect(header.value).not.toContain("secret");
      expect(header.value).not.toContain("token");
      expect(header.value).not.toContain("key");
    }
  });
});

describe("nextSecurityHeaders", () => {
  it("returns Next.js headers format for all paths", () => {
    const config = nextSecurityHeaders({ hsts: false });
    expect(config).toHaveLength(1);
    expect(config[0]?.source).toBe("/:path*");
    expect(config[0]?.headers.map((h) => h.key)).toContain("Content-Security-Policy");
  });
});
