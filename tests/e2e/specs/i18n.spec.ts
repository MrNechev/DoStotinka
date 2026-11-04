import { expect, test } from '@playwright/test';

test.use({ locale: 'bg-BG' });

test('the interface follows a Bulgarian browser', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Добре дошли отново' })).toBeVisible();
  await page.getByRole('button', { name: 'Разгледайте демо профила' }).click();
  await expect(page.getByRole('link', { name: 'Статистика' }).first()).toBeVisible();
  // Default categories are shown in Bulgarian.
  await page.goto('/categories');
  await expect(page.getByText('Храна и напитки').first()).toBeVisible();
});
