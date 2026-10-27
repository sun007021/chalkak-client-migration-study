import { expect, test } from '@playwright/test';

test('앱이 뜬다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
});
