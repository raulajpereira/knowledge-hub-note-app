import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phones, phase 2 (D69): list → detail → back on Emails / Ficheiros /
// Definições, the "+" › Foto quick capture and the PWA's Web Share Target
// (POST /api/v1/share-target → /app/share → a note).
const PHONE = {
  locale: 'pt-PT',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.171' },
};
test.use(PHONE);
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `mobile2-${Date.now()}@example.com`;
const password = 'Mobile-Strong-Pass-1';

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
  const out = execFileSync(
    'npx',
    ['tsx', 'src/cli/index.ts', 'codes:create', '--type', 'license', '--plan', 'PRO'],
    { encoding: 'utf8' },
  );
  const code = /KH-LIC-\d{6}/.exec(out)![0];
  const page = await browser.newPage(PHONE);
  await page.goto('register');
  await page.getByLabel('Nome').fill('Mobile Tester 2');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  execFileSync('npx', ['tsx', 'src/cli/index.ts', 'tenants:module', '--email', email, '--add', 'emails'], {
    encoding: 'utf8',
  });
});

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });
// a real 64×48 PNG (the server sniffs the bytes)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAAt0lEQVR4AeXBARHDABADIHKJmEmsxLrqhDzk97xfURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURRFURQTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaxGkTp02cNnHaH3hEBBF0z3hlAAAAAElFTkSuQmCC',
  'base64',
);
const EML = [
  'From: Ana Silva <ana@example.com>',
  'To: Tester <t@example.com>',
  'Subject: Plano de testes no telemóvel',
  'Date: Tue, 20 Oct 2026 09:30:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Olá, segue o plano.',
  '',
].join('\r\n');

test('Emails: list → email → back (button and browser Back), folders in a sheet', async ({ page }) => {
  await login(page);
  const r = await page.request.post('api/v1/emails/import', {
    multipart: { file: { name: 'plano.eml', mimeType: 'message/rfc822', buffer: Buffer.from(EML) } },
  });
  expect(r.status()).toBe(201);
  await page.goto('app/emails');
  const item = page.locator('.kh-em-item', { hasText: 'Plano de testes no telemóvel' });
  await expect(item).toBeVisible();
  await expect(page.locator('.kh-em-read')).toBeHidden();

  await item.click();
  await expect(page).toHaveURL(/\/app\/emails\?m=/);
  await expect(page.getByRole('heading', { name: 'Plano de testes no telemóvel' })).toBeVisible();
  await expect(item).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/emails$/);
  await expect(item).toBeVisible();

  await item.click();
  await expect(page).toHaveURL(/\/app\/emails\?m=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/emails$/);
  await expect(item).toBeVisible();

  await page.getByRole('button', { name: /^Pastas:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Pastas' });
  await expect(sheet.getByRole('button', { name: 'Todos os Emails' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Todos os Emails' }).click();
  await expect(sheet).toHaveCount(0);
});

test('Ficheiros: upload → full-screen preview → back', async ({ page }) => {
  await login(page);
  await page.goto('app/files');
  await page
    .locator('.kh-fl-up input')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  // the upload opens the file: the preview fills the pane
  await expect(page).toHaveURL(/\/app\/files\?f=/);
  const img = page.locator('.kh-fl-media img');
  await expect(img).toBeVisible();
  const stage = (await page.locator('.kh-fl-main > .kh-fl-stage').boundingBox())!;
  expect(stage.width).toBeGreaterThan(330);
  expect(stage.height).toBeGreaterThan(400);
  await expect(page.locator('.kh-fl-item')).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/files$/);
  await expect(page.locator('.kh-fl-item', { hasText: 'foto.png' })).toBeVisible();
});

test('Definições: the tabs are a list, a tab opens with ← (and Back)', async ({ page }) => {
  await login(page);
  await page.goto('app/settings');
  const tab = page.getByRole('tab', { name: 'Notificações' });
  await expect(tab).toBeVisible();
  await expect(page.locator('.kh-set__body')).toBeHidden();
  await tab.click();
  await expect(page.locator('.kh-set__body')).toBeVisible();
  await expect(tab).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(tab).toBeVisible();
  await expect(page.locator('.kh-set__body')).toBeHidden();

  // the phone's Back closes the tab page, staying in Definições
  await page.getByRole('tab', { name: 'Aparência' }).click();
  await expect(page.locator('.kh-set__body')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole('tab', { name: 'Aparência' })).toBeVisible();
});

test('"+" › Foto da galeria makes a note with the picture and opens it', async ({ page }) => {
  await login(page);
  await tabs(page).getByRole('button', { name: 'Criar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Criar' });
  await expect(sheet.getByRole('button', { name: 'Foto', exact: true })).toBeVisible();
  await expect(sheet.getByTestId('qc-camera')).toHaveAttribute('capture', 'environment');
  await sheet.getByTestId('qc-gallery').setInputFiles({ name: 'g.png', mimeType: 'image/png', buffer: PNG });
  await expect(page).toHaveURL(/\/app\/notes\?n=/);
  await expect(page.getByRole('textbox', { name: 'Sem título' })).toHaveValue(/^Foto \d\d\/\d\d \d\d:\d\d$/);
  await expect(page.locator('.kh-nt-doc img[src*="/api/v1/files/"]')).toBeVisible();
});

test('Web Share Target: POST multipart → /app/share → Nova nota', async ({ page, playwright }) => {
  await login(page);
  // what Android's share sheet sends (manifest share_target)
  const manifest = await (await page.request.get('manifest.webmanifest')).json();
  expect(manifest.share_target.method).toBe('POST');
  expect(manifest.share_target.action).toMatch(/\/api\/v1\/share-target$/);

  const res = await page.request.post('api/v1/share-target', {
    multipart: {
      title: 'Artigo partilhado',
      text: 'Ler mais tarde',
      url: 'https://example.com/artigo',
      files: { name: 'p.png', mimeType: 'image/png', buffer: PNG },
    },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  const to = res.headers()['location']!;
  expect(to).toMatch(/\/app\/share\?k=[\w-]+$/);

  await page.goto(to.replace(/^\/(v2\/)?/, ''));
  await expect(page.getByRole('heading', { name: 'Partilhar com o KnowledgeHub' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('Artigo partilhado');
  await expect(page.locator('.kh-shr__thumb')).toBeVisible();
  await page.getByRole('button', { name: /Nova nota/ }).click();
  await expect(page).toHaveURL(/\/app\/notes\?n=/);
  await expect(page.getByRole('textbox', { name: 'Sem título' })).toHaveValue('Artigo partilhado');
  await expect(page.locator('.kh-nt-doc a[href="https://example.com/artigo"]')).toBeVisible();
  await expect(page.locator('.kh-nt-doc img[src*="/api/v1/files/"]')).toBeVisible();

  // used up: the same link has nothing any more
  await page.goto(to.replace(/^\/(v2\/)?/, ''));
  await expect(page.getByRole('heading', { name: 'Nada para partilhar' })).toBeVisible();

  // a type that is not allowed, or bytes that are not what they claim
  const bad = await page.request.post('api/v1/share-target', {
    multipart: { files: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<script>') } },
    maxRedirects: 0,
  });
  expect(bad.headers()['location']).toMatch(/\/app\/share\?e=type$/);
  // a task from text only
  const t = await page.request.post('api/v1/share-target', {
    multipart: { text: 'Ligar ao cliente amanhã' },
    maxRedirects: 0,
  });
  await page.goto(t.headers()['location']!.replace(/^\/(v2\/)?/, ''));
  await page.getByRole('button', { name: /Nova tarefa/ }).click();
  await expect(page).toHaveURL(/\/app\/tasks\?t=/);

  // without a session: to the login, nothing kept
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const a = await anon.post('api/v1/share-target', { multipart: { text: 'x' }, maxRedirects: 0 });
  expect(a.status()).toBe(303);
  expect(a.headers()['location']).toMatch(/\/login\?next=/);
  await anon.dispose();
});
