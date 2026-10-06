import { expect, test } from '@playwright/test';

test.use({ locale: 'pt-PT' });

test('the root sends visitors without a session to the login page', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.getByText('Knowledge', { exact: true })).toBeVisible();
});

test('the app area requires a session', async ({ page }) => {
  await page.goto('app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
});

test('health endpoint reports every dependency', async ({ request }) => {
  const res = await request.get('api/health');
  const body = await res.json();
  expect(Object.keys(body.checks).sort()).toEqual(['database', 'redis', 'storage']);
  expect(body.checks.database.ok).toBe(true);
  expect(body.checks.redis.ok).toBe(true);
  // Storage (MinIO) is required in CI; locally it may be absent.
  if (process.env.CI) {
    expect(body.checks.storage.ok).toBe(true);
    expect(res.status()).toBe(200);
  }
});
