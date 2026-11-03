import { expect, test } from '@playwright/test';

test('the mobile layout has a bottom navigation and an add button', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore the demo account' }).click();
  const nav = page.locator('nav').filter({ hasText: 'Stats' });
  await expect(nav).toBeVisible();
  await page.getByRole('button', { name: 'Add record' }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Expense/ })).toBeVisible();
});
