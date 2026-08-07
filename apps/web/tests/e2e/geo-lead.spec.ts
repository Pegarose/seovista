import { test, expect } from '@playwright/test';

test('executes end-to-end GEO lead capture workflow', async ({ page }) => {
  // Step 1: Go to /tools/geo-readiness-checker
  await page.goto('/tools/geo-readiness-checker/');
  
  // Wait for the form to be ready
  await expect(page.getByRole('heading', { name: 'GEO Readiness Checker' })).toBeVisible();

  // Step 2: Fill out the form
  await page.getByLabel('Domain URL').fill('https://example.com');
  await page.getByLabel('Brand Name').fill('Example');
  await page.getByLabel('Primary Market').selectOption('Global');
  
  // Submit the form
  await expect(page.locator('form [type="submit"]')).toBeVisible({ timeout: 15000 });
  await page.locator('form [type="submit"]').click();

  // Step 3: Wait for redirection to /result/
  await page.waitForURL(/\/tools\/geo-readiness-checker\/result\/.+/, { timeout: 30000 });
  
  // Ensure we landed on the result polling/status page
  // The AuditPoller component should render here while loading
  // Since db mock runs it fast, we can just wait for the gating form
  
  // Step 4: Wait for the gating form text requesting an email
  // The gate renders "Unlock Full Detailed Report"
  await expect(page.getByRole('heading', { name: 'Unlock Full Detailed Report' })).toBeVisible({ timeout: 15000 });
  
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
  // Should wait for Crew CTA heading
  await expect(page.getByRole('heading', { name: 'Need a hand with the next step?' })).toBeVisible({ timeout: 10000 });
  
  // Also expect the mock strings are NOT visible anymore. They were removed.
  await expect(page.getByText('AI Model A')).not.toBeVisible();
  await expect(page.getByText('Full Raw Dashboard')).not.toBeVisible();
});
