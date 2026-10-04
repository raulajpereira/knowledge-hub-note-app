import { expect, test } from '@playwright/test';

test('placeholder home renders the brand and the glass panel', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('KnowledgeHub');
  await expect(page.getByText('Em construção')).toBeVisible();
  await expect(page.getByText('Knowledge', { exact: true })).toBeVisible();
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
