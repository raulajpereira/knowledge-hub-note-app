import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Fase 11.2: WCAG 2.1 AA (axe) on the sign-in pages and the main screens of a
// new account, so the fixes stay fixed.
test.use({
  locale: 'pt-PT',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.131' },
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const found = r.violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.nodes[0]?.target.join(' ')}`);
  expect(found).toEqual([]);
}

test('sign-in pages', async ({ page }) => {
  for (const p of ['login', 'register', 'reset-password']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await axe(page, p);
  }
});

test('main screens of an account', async ({ page }) => {
  test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');
  test.setTimeout(120_000);
  const email = `a11y-${Date.now()}@example.com`;
  const password = 'A11y-Strong-Pass-1';
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'ULTRA'))![0];
  await page.goto('register');
  await page.getByLabel('Nome').fill('A11y Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  let link = '';
  for (let i = 0; i < 40 && !link; i++) {
    const f = fs.readdirSync(outbox!).filter((x) => x.includes('-verify-') && x.includes(safe));
    if (f.length) {
      const u = new URL(
        /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(
          (JSON.parse(fs.readFileSync(path.join(outbox!, f[0]!), 'utf8')) as { text: string }).text,
        )![0],
      );
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      link = u.pathname.replace(new RegExp(`^${base}/`), '').replace(/^\//, '') + u.search;
    } else await new Promise((r) => setTimeout(r, 250));
  }
  await page.goto(link);
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);
  for (const v of [
    '',
    'notes',
    'tasks',
    'calendar',
    'artifacts',
    'systems',
    'mg-overview',
    'settings',
    'trash',
    'pricing',
  ]) {
    await page.goto(`app${v ? `/${v}` : ''}`);
    await page.waitForLoadState('networkidle');
    await axe(page, `app/${v}`);
  }
  await page.goto('app');
  await page.getByTitle('Conta e Dados').click();
  await expect(page.getByRole('dialog', { name: 'Conta e Dados' })).toBeVisible();
  await axe(page, 'account');
});
