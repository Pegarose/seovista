import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e-results",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /routes\.spec\.ts/,
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /routes\.spec\.ts/,
    },
    {
      name: "a11y",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /a11y\.spec\.ts/,
    },
    {
      name: "seo",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /seo\.spec\.ts/,
    },
    {
      name: "production-routing",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /runtime-routing\.spec\.ts/,
      metadata: { runtime: "production" },
    },
  ],
  webServer: {
    command:
      "node ../../scripts/run-isolated-web-command.js playwright build && node ../../scripts/run-isolated-web-command.js playwright serve",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SITE_URL: "https://seovista.com",
      NEXTG_API_URL: "http://localhost:3101",
      NEXT_DIST_DIR: ".next-playwright",
    },
  },
});
