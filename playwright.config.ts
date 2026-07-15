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
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command:
      "node scripts/run-isolated-web-command.js playwright build && node scripts/run-isolated-web-command.js playwright serve",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SITE_URL: "https://seovista.com",
      NEXTG_API_URL: "http://localhost:3101",
      NEXT_DIST_DIR: ".next-playwright",
    },
  },
});
