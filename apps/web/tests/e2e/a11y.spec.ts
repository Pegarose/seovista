import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const representativeRoutes = [
  "/",
  "/geo/",
  "/tools/",
  "/tools/geo-readiness-checker/",
  "/contact/",
  "/privacy/",
];

for (const route of representativeRoutes) {
  test(`axe reports no serious or critical violations on ${route} at desktop`, async ({ page }) => {
    await page.goto(route);
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousOrCritical).toHaveLength(0);
  });

  test(`axe reports no serious or critical violations on ${route} at mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(route);
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = accessibilityScanResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(seriousOrCritical).toHaveLength(0);
  });
}

test("mobile navigation toggle is keyboard operable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const menuButton = page.locator("button[aria-controls='mobile-nav']");
  await expect(menuButton).toBeVisible();
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("nav#mobile-nav")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("nav#mobile-nav")).toHaveCount(0);
});

test("keyboard navigation through header links has visible focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.locator("a:focus");
  await expect(skipLink).toBeVisible();
  // Verify a visible focus indicator exists (box-shadow or outline must not be "none")
  const boxShadow = await skipLink.evaluate((el) => window.getComputedStyle(el).boxShadow);
  const outline = await skipLink.evaluate((el) => window.getComputedStyle(el).outline);
  const hasFocusIndicator = boxShadow !== "none" || (outline !== "none" && outline !== "rgb(0, 0, 0) none 0px");
  expect(hasFocusIndicator).toBe(true);
});
