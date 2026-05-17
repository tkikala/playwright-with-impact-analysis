import { test, expect } from 'playwright-impact-analysis/playwright';

test('renders button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
});
