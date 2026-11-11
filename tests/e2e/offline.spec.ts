import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Offline: notes and tasks read from the copy on this device; an edit made offline is sent when the connection is back.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `offline-${Date.now()}@example.com`;
const password = 'Offline-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.218' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Offline Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('read offline, edit offline, sent when back online', async ({ page, context }) => {
  await login(page);
  await page.goto('app/notes');
  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Plano offline');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Versão com ligação.');
  await page.waitForTimeout(1500); // autosave
  // the service worker controls the page after a reload; visit the note once more online
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  await page.locator('.kh-nt-card', { hasText: 'Plano offline' }).click();
  await expect(page.locator('.kh-ne')).toContainText('Versão com ligação.');
  const url = page.url();
  await page.waitForTimeout(800);

  await context.setOffline(true);
  await page.goto(url);
  await expect(page.locator('.kh-offline')).toBeVisible();
  await expect(page.locator('.kh-ne')).toContainText('Versão com ligação.');
  await page.locator('.kh-ne').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Editado sem ligação.');
  await expect(page.locator('.kh-offline')).toContainText('1 por enviar');

  await context.setOffline(false);
  await expect(page.getByText(/alterações feitas sem ligação foram enviadas/)).toBeVisible({
    timeout: 40_000,
  });
  await page.reload();
  await expect(page.locator('.kh-ne')).toContainText('Editado sem ligação.');
});

test('changed elsewhere while offline: the offline version becomes a copy', async ({
  page,
  context,
  browser,
}) => {
  await login(page);
  await page.goto('app/notes');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  // the list opens its first note by itself: wait for it before making a new one
  await expect(page.locator('.kh-ne')).toContainText('Editado sem ligação.');
  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Nota partilhada');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Original.');
  await page.waitForTimeout(1500);
  const id = new URL(page.url()).searchParams.get('n')!;
  // the device's copy of the note
  await page.evaluate((nid) => fetch(`${location.pathname.replace(/\/app.*/, '')}/api/v1/notes/${nid}`), id);
  await page.waitForTimeout(500);

  await context.setOffline(true);
  await page.locator('.kh-ne').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Do telemóvel.');
  await expect(page.locator('.kh-offline')).toContainText('1 por enviar');

  // meanwhile, another device changes the note
  const other = await browser.newContext({ locale: 'pt-PT' });
  const p2 = await other.newPage();
  await login(p2);
  await p2.waitForTimeout(1100);
  const r = await p2.request.patch(`api/v1/notes/${id}`, { data: { title: 'Nota partilhada (PC)' } });
  expect(r.ok()).toBe(true);
  await other.close();

  await context.setOffline(false);
  await expect(page.getByText(/guardada como cópia/)).toBeVisible({ timeout: 40_000 });
  await page.goto('app/notes');
  // the copy takes the note's current title; it keeps the text written offline
  const copy = page.locator('.kh-nt-card', { hasText: '(cópia offline)' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.locator('.kh-ne')).toContainText('Do telemóvel.');
  // and the note changed elsewhere stays as it is (original + copy)
  expect(
    await page.locator('.kh-nt-card', { hasText: 'Nota partilhada (PC)' }).count(),
  ).toBeGreaterThanOrEqual(2);
});
