import { test, expect } from 'playwright-impact-analysis/playwright';

test('renders app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Demo app')).toBeVisible();
});
