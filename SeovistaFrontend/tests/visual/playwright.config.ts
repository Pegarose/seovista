import { defineConfig } from "@playwright/test";

/**
 * Visual regression config. Baselines live next to the spec in
 * tests/visual/__screenshots__/. Update with `bun run test:visual:update`.
 *
 * The dev server is expected to be running at http://localhost:8080 (Vite).
 * CI starts it via the `webServer` block below.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  snapshotDir: "./__screenshots__",
  snapshotPathTemplate:
    "{snapshotDir}/{testFileName}/{arg}{-projectName}{ext}",
  expect: {
    toHaveScreenshot: {
      // Small tolerance for antialiasing and font hinting variance.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 1800 },
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        viewport: { width: 1280, height: 1800 },
      },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 1280, height: 1800 },
      },
    },
  ],
  outputDir: "/tmp/browser/seovista/visual-output",
  webServer: process.env.CI
    ? {
        command: "bun run dev",
        url: "http://localhost:8080",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
