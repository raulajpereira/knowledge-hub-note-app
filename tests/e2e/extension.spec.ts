import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The browser extension: the zip from Definições, and the "Partilhar" page it opens (title, address, selection).
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `ext-${Date.now()}@example.com`;
const password = 'Ext-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.217' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Ext Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('download the extension; its "Partilhar" page makes a note; no javascript: links', async ({ page }) => {
  await login(page);
  await page.goto('app/settings?tab=ext');
  await expect(page.getByText('Guardar páginas a partir do navegador')).toBeVisible();
  const r = await page.request.get('api/v1/extension');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('application/zip');
  const zip = await r.body();
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.includes(Buffer.from('knowledgehub-extension/manifest.json'))).toBe(true);

  await page.goto(
    'app/share?title=Nota%20SAP%203089413&url=https%3A%2F%2Fme.sap.com%2Fnotes%2F3089413&text=Corre%C3%A7%C3%A3o%20do%20IVA',
  );
  await expect(page.getByRole('textbox').first()).toHaveValue('Nota SAP 3089413');
  await expect(page.locator('.kh-shr__url')).toHaveText('https://me.sap.com/notes/3089413');
  await page.getByRole('button', { name: /Nova nota/ }).click();
  await page.waitForURL(/\/app\/notes\?n=/);
  await expect(page.locator('.kh-ne')).toContainText('Correção do IVA');

  await page.goto('app/share?title=x&url=javascript%3Aalert(1)&text=ok');
  await expect(page.getByText('ok', { exact: true })).toBeVisible();
  await expect(page.locator('.kh-shr__url')).toHaveCount(0);
});
