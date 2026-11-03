import { expect, test } from '@playwright/test';

const email = `e2e-${Date.now()}@example.com`;
const password = 'e2e-password-123';

test.describe.configure({ mode: 'serial' });

test('a new user can register, create an account and log an expense', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: /E2E/ })).toBeVisible();
  await expect(page.getByText('Getting started')).toBeVisible();

  // Create an account with a starting balance.
  await page.goto('/accounts?new=1');
  await page.getByLabel('Name').fill('Wallet');
  await page.getByLabel('Type').selectOption('cash');
  await page.getByLabel('Starting balance').fill('100');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Account created')).toBeVisible();

  // Add an expense through the record editor and the category picker.
  await page.goto('/');
  await page.getByRole('button', { name: 'Add record' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#amount').fill('12.5');
  await dialog.getByRole('button', { name: 'Choose a category' }).click();
  await dialog.getByPlaceholder('Search categories…').fill('Groceries');
  await dialog.getByRole('button', { name: /^Groceries/ }).click();
  await dialog.getByLabel('Payee').fill('Corner shop');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Expense saved')).toBeVisible();

  // Balance and statistics reflect the expense.
  await page.goto('/accounts');
  await expect(page.getByText('€87.50').first()).toBeVisible();
  await page.goto('/statistics?period=30d');
  await expect(page.getByRole('button', { name: /Food & Drinks\s*€12\.50/ })).toBeVisible();
  await page.goto('/records?q=Corner');
  await expect(page.getByText('Corner shop')).toBeVisible();
});

test('the user can log out and back in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /E2E/ })).toBeVisible();
});

test('the demo account shows a filled dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Explore the demo account' }).click();
  await expect(page.getByText('Main Bank Account').first()).toBeVisible();
  await expect(page.getByText('Spending this month')).toBeVisible();
  await page.goto('/statistics?period=6m');
  await expect(page.getByText('Report')).toBeVisible();
});
