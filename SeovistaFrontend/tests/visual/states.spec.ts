import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Visual regression coverage for every editorial state rendered on the
 * /design/states/ fixture route. Each frame is captured as an element
 * screenshot so layout shifts elsewhere on the page cannot flake the diff.
 *
 * Screenshots are also mirrored to /tmp/browser/seovista/shots/ so CI logs
 * and local Playwright runs share one output location, matching the
 * project's convention for browser artifacts.
 */

const SHOTS_DIR = "/tmp/browser/seovista/shots";

const CASES: Array<{ id: string; name: string }> = [
  { id: "state-ledger-skeleton", name: "ledger-skeleton" },
  { id: "state-instrument-skeleton", name: "instrument-skeleton" },
  { id: "state-loading", name: "loading" },
  { id: "state-empty", name: "empty" },
  { id: "state-unavailable", name: "unavailable" },
  { id: "state-error", name: "retry-error" },
];

async function freezeUI(page: Page) {
  // Disable animations and transitions so pulsing skeletons render a stable
  // frame. Playwright also freezes CSS animations via `animations: "disabled"`
  // in expect config, but overriding here covers `transition` too.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

test.beforeAll(() => {
  mkdirSync(SHOTS_DIR, { recursive: true });
});

test.describe("editorial states — visual regression", () => {
  for (const c of CASES) {
    test(c.name, async ({ page }, testInfo) => {
      await page.goto("/design/states", { waitUntil: "networkidle" });
      await freezeUI(page);

      const frame = page.getByTestId(c.id);
      await expect(frame).toBeVisible();

      const snapshotName = `${c.name}.png`;
      await expect(frame).toHaveScreenshot(snapshotName);

      // Mirror the fresh capture to /tmp/browser/seovista/shots/ for humans
      // and attach it to the Playwright report so CI artifacts include it.
      const mirrorPath = join(SHOTS_DIR, snapshotName);
      const bytes = await frame.screenshot({ path: mirrorPath });
      await testInfo.attach(snapshotName, {
        body: bytes,
        contentType: "image/png",
      });
    });
  }
});
