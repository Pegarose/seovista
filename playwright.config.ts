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
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @seovista/web build && pnpm --filter @seovista/web start",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
