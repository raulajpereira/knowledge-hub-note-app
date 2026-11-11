import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// "O seu dia": the Início popup (meetings + pending tasks), the day's note in "Diário", "Dispensar hoje".
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `daily-${Date.now()}@example.com`;
const password = 'Daily-Strong-Pass-1';

const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

async function verifyLink(): Promise<string> {
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(outbox!)
      ? fs.readdirSync(outbox!).filter((f) => f.includes('-verify-') && f.includes(safe))
      : [];
    if (files.length) {
      const msg = JSON.parse(fs.readFileSync(path.join(outbox!, files.sort().at(-1)!), 'utf8')) as {
        text: string;
      };
      const url = new URL(/https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.text)![0]);
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      return url.pathname.replace(new RegExp(`^${base}/`), '').replace(/^\//, '') + url.search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no verify email');
}

async function login(page: Page) {
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);
}

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    // own IP: the register limit (10/h per IP) is shared by every spec without one
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.216' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Daily Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test("popup on the Início, the day's note once, dismissed for the day", async ({ page }) => {
  await login(page);
  // automated browsers only see it with ?daily=1
  await page.goto('app?daily=1');
  const pop = page.getByRole('dialog', { name: 'O seu dia' });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Sem reuniões neste dia.');
  await pop.getByRole('button', { name: 'Abrir a nota do dia' }).click();
  await page.waitForURL(/\/app\/notes\?n=/);
  await expect(page.locator('.kh-ne')).toContainText('Reuniões');
  await expect(page.locator('.kh-ne')).toContainText('Notas');
  const url = page.url();

  // opened again: the same note (not a second one)
  await page.goto('app?daily=1');
  await expect(page.getByRole('dialog', { name: 'O seu dia' })).toHaveCount(0);
  await page.getByRole('button', { name: 'O meu dia' }).click();
  await page
    .getByRole('dialog', { name: 'O seu dia' })
    .getByRole('button', { name: 'Abrir a nota do dia' })
    .click();
  await page.waitForURL(/\/app\/notes\?n=/);
  expect(page.url()).toBe(url);
  await expect(page.locator('.kh-nt-folder', { hasText: 'Diário' })).toBeVisible();
});
