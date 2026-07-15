import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e-results",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "development-routing",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /runtime-routing\.spec\.ts/,
    },
  ],
  webServer: {
    command: "node ../../scripts/run-isolated-web-command.js development dev",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      WEB_TEST_RUNTIME: "development",
      NEXT_PUBLIC_SITE_URL: "https://seovista.com",
      NEXTG_API_URL: "http://localhost:3101",
      NEXT_DIST_DIR: ".next-development",
    },
  },
});
