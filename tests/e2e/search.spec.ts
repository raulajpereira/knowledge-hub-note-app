import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Pesquisa por significado e OCR: the status card in Definições › Assistente IA (with the
// rate-limited "Reindexar") and the text the worker recognises in an image of Ficheiros.
// Needs the worker running (as in CI) for the OCR part.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `search-${Date.now()}@example.com`;
const password = 'Search-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.153' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Search Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('status card and Reindexar (rate-limited)', async ({ page }) => {
  await login(page);
  await page.goto('app/settings');
  await page.getByRole('tab', { name: 'Assistente IA' }).click();
  const card = page.getByTestId('semantic-card');
  await expect(card).toContainText('Pesquisa por significado e OCR');
  await expect(card.getByTestId('semantic-state')).toHaveText(
    /Ativa|Indisponível de momento|Desligada neste servidor/,
  );
  const state = await card.getByTestId('semantic-state').innerText();
  test.skip(/Desligada/.test(state), 'semantic search is off on this server');
  await page.request.post('api/v1/notes', { data: { title: 'Faturas em atraso' } });
  const re = card.getByRole('button', { name: 'Reindexar' });
  await re.click();
  await expect(page.getByText(/itens voltam a ser indexados/)).toBeVisible();
  await re.click();
  await re.click();
  await expect(page.getByText('Já reindexou há pouco. Tente mais tarde.')).toBeVisible();
});

test('text in an image of Ficheiros is recognised and shown under the preview', async ({ page }) => {
  await login(page);
  const { createCanvas } = await import('@napi-rs/canvas');
  const cv = createCanvas(900, 160);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 900, 160);
  g.fillStyle = '#000';
  g.font = '44px sans-serif';
  g.fillText('Fatura FT 2026/118 paga', 20, 95);
  await page.goto('app/files');
  await page
    .locator('.kh-fl-up input')
    .setInputFiles([{ name: 'recibo.png', mimeType: 'image/png', buffer: await cv.encode('png') }]);
  await expect(page.locator('.kh-fl-item:not(.kh-fl-item--up)')).toHaveCount(1, { timeout: 30_000 });
  const { files } = (await (await page.request.get('api/v1/drive')).json()) as {
    files: Array<{ id: string }>;
  };
  // the worker reads it within seconds (OCR jobs are not debounced)
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`api/v1/drive/${files[0]!.id}/text`)).json()) as {
            ocr: { status: string } | null;
          }
        ).ocr?.status,
      { timeout: 90_000 },
    )
    .toBe('done');
  await page.reload();
  const ocr = page.getByTestId('ocr-text');
  await ocr.locator('summary').click();
  // OCR may misread a digit of the number (it once read 118 as 1118): check the words around it
  await expect(ocr.locator('pre')).toContainText(/Fatura FT 2026\/\d+ paga/);
  // the Ficheiros search box finds the file by the text inside the image
  const search = page.getByLabel('Pesquisar ficheiros');
  await search.fill('paga');
  await expect(page.locator('.kh-fl-item', { hasText: 'recibo.png' })).toBeVisible();
  await search.fill('inexistente');
  await expect(page.locator('.kh-fl-item')).toHaveCount(0);
});
