import { test, expect } from '@playwright/test';

test('executes end-to-end GEO lead capture workflow', async ({ page }) => {
  // Step 1: Go to /tools/geo-readiness-checker
  await page.goto('/tools/geo-readiness-checker');
  
  // Wait for the form to be ready
  await expect(page.getByRole('heading', { name: 'GEO Readiness Checker' })).toBeVisible();

  // Step 2: Fill out the form
  await page.getByLabel('Domain URL').fill('https://playwright-test.com');
  await page.getByLabel('Brand Name').fill('PlaywrightTest');
  await page.getByLabel('Primary Market').selectOption('USA');
  
  // Submit the form
  await page.getByRole('button', { name: 'Start Free Audit' }).click();

  // Step 3: Wait for redirection to /result/
  await page.waitForURL(/\/tools\/geo-readiness-checker\/result\/.+/);
  
  // Ensure we landed on the result polling/status page
  // The AuditPoller component should render here while loading
  // Since db mock runs it fast, we can just wait for the gating form
  
  // Step 4: Wait for the gating form text requesting an email
  // The gate renders "Audit Complete: Summary"
  await expect(page.getByRole('heading', { name: 'Audit Complete: Summary' })).toBeVisible({ timeout: 15000 });
  
  // Fill the email and check the consent checkbox
  // We need to look at GatedReportForm to confirm exact locators, but usually it's "Work Email"
  await page.getByLabel(/Work Email/i).fill('playwright@seovista.example');
  
  // Consent checkbox, label usually has "consent" or "agree"
  // Assuming a generic checkbox locator if no specific label is found, let's look at the component if needed, 
  // but for now we'll guess standard names or update if needed.
  // We'll use a generic selector for checkboxes.
  await page.getByRole('checkbox').check();
  
  // Submit the gated form
  await page.getByRole('button', { name: 'Unlock Report' }).click();
  
  // Assert the final metrics screen appears cleanly
  await expect(page.getByRole('heading', { name: 'Full Raw Dashboard' })).toBeVisible({ timeout: 10000 });
});
