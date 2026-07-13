/**
 * SeoVista Sprint 0 — Lighthouse CI Configuration
 *
 * Version-controlled route set (VAL-QUALITY-007):
 *   - / (home)
 *   - /geo/ (service route — GEO)
 *   - /tools/ (tools index)
 *   - /tools/geo-readiness-checker/ (checker foundation)
 *   - /contact/ (contact)
 *   - /terms/ (legal route)
 *
 * Assertions:
 *   - Performance >= 0.90
 *   - SEO = 1.00 (error if below)
 *   - Accessibility >= 0.95 (error if below)
 *   - LCP <= 2500ms
 *   - CLS <= 0.1
 *   - TTFB <= 800ms
 *   - INP <= 200ms (warn if above; recorded as "not collected" when unavailable)
 *
 * Cleanup: pnpm lighthouse must stop server, profiles, networks, and
 * containers on success, assertion/startup failure, and interruption.
 */

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      url: [
        "http://localhost:3100/",
        "http://localhost:3100/geo/",
        "http://localhost:3100/tools/",
        "http://localhost:3100/tools/geo-readiness-checker/",
        "http://localhost:3100/contact/",
        "http://localhost:3100/terms/",
      ],
      startServerCommand: "pnpm --filter @seovista/web build && pnpm --filter @seovista/web start",
      startServerReadyPattern: "Ready on",
      startServerReadyTimeout: 120000,
      settings: {
        // Run each URL as a separate audit (no averaging across routes)
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        formFactor: "desktop",
        screenEmulation: { disabled: true },
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        chromeFlags: "--headless=new --no-sandbox --disable-gpu",
      },
    },
    assert: {
      assertions: {
        // Core categories
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 1.0 }],
        // Core Web Vitals
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        // TTFB (server-response-time)
        "server-response-time": ["error", { maxNumericValue: 800 }],
        // INP — warn if above 200ms; recorded as "not collected" when unavailable
        "interaction-to-next-paint": ["warn", { maxNumericValue: 200 }],
      },
      includePassedAssertions: true,
    },
    upload: {
      target: "temporary-public-storage",
    },
    // Cleanup: LHCI handles process cleanup through its own lifecycle,
    // but the wrapper command (pnpm lighthouse) must ensure server is
    // always stopped. The `startServerCommand` process is killed by LHCI
    // on completion, but additional cleanup in the root script ensures
    // no orphaned resources.
  },
};

