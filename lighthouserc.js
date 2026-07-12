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
      startServerCommand: "pnpm --filter @seovista/web start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 120000,
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 1 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 200 }],
        "server-response-time": ["warn", { maxNumericValue: 800 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
