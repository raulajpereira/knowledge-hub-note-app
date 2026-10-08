import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Ficheiros: chunked upload, the limits notice, previews, rename, folders, download headers, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `files-${Date.now()}@example.com`;
const password = 'Files-Strong-Pass-1';

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
  // its own address for the registration limit (10 an hour per IP)
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.140' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Files Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('upload in chunks, see the content, rename, folder, download and Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/files');
  // the limits are on the page
  await expect(page.locator('.kh-fl-quota')).toContainText('1 GB');
  await expect(page.locator('.kh-fl-quota')).toContainText('50 MB');
  await expect(page.getByText('Arraste ficheiros para aqui')).toBeVisible();

  await page.locator('.kh-em-newfolder input').fill('Projeto Atlas');
  await page.getByRole('button', { name: '+ Nova Pasta' }).click();
  await expect(page.locator('.kh-em-folder[data-on]')).toContainText('Projeto Atlas');

  // a text file (highlighted preview) and a file over one chunk (8 MB) in one go
  const big = Buffer.alloc(9 * 1024 * 1024, 7);
  await page.locator('.kh-fl-up input').setInputFiles([
    {
      name: 'ZHR_CHECK.abap',
      mimeType: 'text/plain',
      buffer: Buffer.from('REPORT zhr_check.\nWRITE / sy-uname.\n'),
    },
    { name: 'dump.bin', mimeType: 'application/octet-stream', buffer: big },
  ]);
  await expect(page.locator('.kh-fl-item:not(.kh-fl-item--up)')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('.kh-fl-item', { hasText: 'dump.bin' })).toContainText('9 MB');
  await expect(page.locator('.kh-em-folder[data-on] .kh-em-count')).toHaveText('2');
  await expect(page.locator('.kh-fl-quota')).toContainText('9 MB');

  // a file without a preview offers the download
  await expect(page.getByText('Este tipo de ficheiro não tem pré-visualização')).toBeVisible();
  await page.locator('.kh-fl-item', { hasText: 'ZHR_CHECK.abap' }).click();
  await expect(page.locator('.kh-fl-text code')).toContainText('REPORT zhr_check.');
  await expect(page.locator('.kh-fl-text .kh-hl-k').first()).toBeVisible();

  // renaming keeps the extension
  const name = page.getByLabel('Nome do ficheiro');
  await name.fill('Verificação payroll');
  await name.press('Enter');
  await expect(page.locator('.kh-fl-item[data-on]')).toContainText('Verificação payroll.abap');

  // download: always an attachment; inline only for safe types, framed only by the app
  const id = new URL(page.url()).searchParams.get('f')!;
  const dl = await page.request.get(`api/v1/drive/${id}/raw?dl=1`);
  expect(dl.headers()['content-disposition']).toMatch(/^attachment;/);
  const inline = await page.request.get(`api/v1/drive/${id}/raw`, { headers: { Range: 'bytes=0-5' } });
  expect(inline.status()).toBe(206);
  expect(inline.headers()['content-type']).toBe('text/plain; charset=utf-8');
  expect(inline.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect(await inline.text()).toBe('REPORT');

  // over the largest size: refused before anything is sent
  const tooBig = await page.request.post('api/v1/drive/uploads', {
    data: { name: 'x.iso', size: 51 * 1024 * 1024 },
  });
  expect(tooBig.status()).toBe(413);

  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-fl-item')).toHaveCount(1);
  await page.goto('app/trash');
  await expect(page.getByText('Verificação payroll.abap')).toBeVisible();
});
