import { expect, test } from '@playwright/test';

test.use({ locale: 'pt-PT' });

test('the root shows the landing page to visitors; Entrar goes to the login', async ({ page }) => {
  await page.goto('./');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Notas, tarefas, código, SAP e equipas num só lugar.' }),
  ).toBeVisible();
  // real plans from the catalogue
  await expect(page.locator('.kh-lp-plan', { hasText: 'ULTRA' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', /\/terms$/);
  await page.getByRole('banner').getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await expect(page.getByText('Knowledge', { exact: true })).toBeVisible();
});

test('terms and privacy are public, in PT/EN, and say they are provisional until reviewed', async ({
  page,
}) => {
  await page.goto('terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Termos de Utilização' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Versão provisória');
  await page.getByRole('radio', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await page.getByRole('radio', { name: 'PT' }).click();
  await page.goto('privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '6. Cookies' })).toBeVisible();
  // the sign-up form links to both
  await page.goto('register');
  await expect(page.getByRole('link', { name: 'Termos de Utilização' })).toHaveAttribute('href', /\/terms$/);
  await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
    'href',
    /\/privacy$/,
  );
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
