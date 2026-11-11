import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Notes: "[[" links to another item while typing; the link shows in Ligações on both sides.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `wiki-${Date.now()}@example.com`;
const password = 'Wiki-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.215' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Wiki Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('typing [[ picks a note, inserts the link and links both notes', async ({ page }) => {
  await login(page);
  await page.goto('app/notes');
  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Plano de cutover');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Datas e responsáveis.');
  await page.waitForTimeout(1200); // autosave

  await expect(page.locator('.kh-nt-card', { hasText: 'Plano de cutover' })).toBeVisible();
  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Reunião de arranque');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ver [[cutov');
  const pop = page.getByRole('listbox', { name: 'Ligar a…' });
  await expect(pop.getByRole('option', { name: /Plano de cutover/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(pop).toHaveCount(0);
  const ed = page.locator('.kh-ne');
  await expect(ed.locator('a', { hasText: 'Plano de cutover' })).toBeVisible();
  await expect(ed).not.toContainText('[[');
  await expect(page.locator('.kh-cx__link')).toContainText('Plano de cutover');
  await page.waitForTimeout(1200); // autosave

  // the other side: "Plano de cutover" lists "Reunião de arranque"
  // (the newer note shows "Plano de cutover" in its summary too: the older card is the last one)
  await page.locator('.kh-nt-card', { hasText: 'Plano de cutover' }).last().click();
  await expect(page.locator('.kh-cx__link')).toContainText('Reunião de arranque');
  // Escape closes the list and keeps the text
  await page.locator('.kh-ne').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' [[x');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(page.locator('.kh-ne')).toContainText('[[x');
});
