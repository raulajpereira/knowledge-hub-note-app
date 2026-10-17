import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// SAP batch C: Notas SAP (new note + status matrix), test evidence on a step
// and the test report, the landscape map, and a cutover dependency blocking a task.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `sapc-${Date.now()}@example.com`;
const password = 'Sap-Strong-Pass-1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGM4YaNBEmIY1TCqYfhqAAAeBCwQMwPSngAAAABJRU5ErkJggg==',
  'base64',
);

const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

async function verifyLink(): Promise<string> {
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(outbox!)
      ? fs.readdirSync(outbox!).filter((f) => f.includes('-verify-') && f.includes(safe))
      : [];
    if (files.length) {
      let text = '';
      try {
        // the file may still be being written
        text = (
          JSON.parse(fs.readFileSync(path.join(outbox!, files.sort().at(-1)!), 'utf8')) as { text: string }
        ).text;
      } catch {
        text = '';
      }
      const m = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(text);
      if (m) {
        const url = new URL(m[0]);
        const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
        return url.pathname.replace(new RegExp(`^${base}/`), '').replace(/^\//, '') + url.search;
      }
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
async function post<T>(page: Page, url: string, data: unknown, method: 'post' | 'patch' = 'post') {
  const r = await page.request[method](url, { data });
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()) as T;
}

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'SAP'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.73' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Sap Batch C');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

type Sys = { system: { id: string } };

test('landscape map: systems in lanes, arrows with the requests waiting', async ({ page }) => {
  await login(page);
  const dev = await post<Sys>(page, 'api/v1/sap/systems', { name: 'S/4 DEV', sid: 'S4D', env: 'DEV' });
  await post<Sys>(page, 'api/v1/sap/systems', { name: 'S/4 QAS', sid: 'S4Q', env: 'QAS' });
  await post<Sys>(page, 'api/v1/sap/systems', { name: 'S/4 PRD', sid: 'S4P', env: 'PRD' });
  const tr = await post<{ transport: { id: string } }>(page, 'api/v1/sap/transports', {
    systemId: dev.system.id,
    trkorr: 'S4DK900001',
    description: 'Ajuste IVA',
  });
  await post(page, `api/v1/sap/transports/${tr.transport.id}`, { steps: { released: true } }, 'patch');

  await page.goto('app/systems');
  await page.getByRole('radio', { name: 'Mapa' }).click();
  const map = page.getByRole('img', { name: 'Mapa da paisagem' });
  await expect(map).toBeVisible();
  for (const sid of ['S4D', 'S4Q', 'S4P'])
    await expect(map.getByRole('button', { name: new RegExp(`^${sid} S/4`) })).toBeVisible();
  const arrow = map.getByRole('button', { name: '1 ordem à espera de S4Q' });
  await expect(arrow).toBeVisible();
  await arrow.click();
  await expect(page.getByRole('region', { name: 'Ordens à espera' }).getByText('S4DK900001')).toBeVisible();
  await page.getByRole('region', { name: 'Ordens à espera' }).getByRole('button', { name: 'Fechar' }).click();
  // a system opens its details
  await map.getByRole('button', { name: /^S4P S\/4/ }).click();
  await expect(page.getByLabel('Sistema', { exact: true })).toHaveValue('S/4 PRD');
});

test('SAP notes: new note, status in the matrix', async ({ page }) => {
  await login(page);
  await page.goto('app/sapnotes');
  await page.getByRole('button', { name: 'Nova Nota' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Número').fill('3089413');
  await dlg.getByLabel('Título').fill('Correção do IVA');
  await dlg.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.locator('.kh-sap-panel').getByRole('textbox', { name: 'Título', exact: true }),
  ).toHaveValue('Correção do IVA');
  await expect(page.getByRole('link', { name: /me\.sap\.com/ })).toHaveAttribute(
    'href',
    'https://me.sap.com/notes/3089413',
  );
  await page.getByRole('radio', { name: 'Matriz' }).click();
  const cell = page.getByLabel('3089413 · S4P/100');
  await expect(cell).toHaveValue('new');
  const saved = page.waitForResponse((r) => r.url().includes('/systems/') && r.request().method() === 'PUT');
  await cell.selectOption('done');
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await page.getByRole('radio', { name: 'Matriz' }).click();
  await expect(page.getByLabel('3089413 · S4P/100')).toHaveValue('done');
  // import a pasted list: the existing one is skipped
  await page.getByRole('button', { name: 'Importar' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('3089413\n2998510, 3131059');
  await page.getByRole('button', { name: 'Importar notas' }).click();
  await expect(page.getByText('2 notas criadas, 1 já existiam')).toBeVisible();
});

test('test evidence on a step, lightbox and the test report', async ({ page }) => {
  await login(page);
  const { record } = await post<{ record: { id: string } }>(page, 'api/v1/sap/functional', {
    page: 'fn_test',
    title: 'Venda nacional',
    rows: [{ step: 'Criar encomenda VA01', expected: 'Encomenda criada' }],
  });
  await page.goto(`app/fn-test?r=${record.id}`);
  const up = page.waitForResponse((r) => r.url().includes('/evidence?row=') && r.ok());
  await page.locator('.kh-ev input[type=file]').first().setInputFiles({
    name: 'va01.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await up;
  await page.getByRole('button', { name: 'Abrir va01.png' }).click();
  await expect(page.getByRole('dialog', { name: 'va01.png' })).toBeVisible();
  await page.keyboard.press('Escape');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Relatório' }).last().click();
  const rep = await popup;
  await expect(rep.getByRole('heading', { name: 'Relatório de testes' })).toBeVisible();
  await expect(rep.getByRole('heading', { name: 'Venda nacional' })).toBeVisible();
  await expect(rep.getByRole('img', { name: 'va01.png' })).toBeVisible();
  expect(
    await rep.getByRole('img', { name: 'va01.png' }).evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBe(16);
});

test('cutover: a task stays blocked until its predecessor is done', async ({ page }) => {
  await login(page);
  const { record } = await post<{ record: { id: string } }>(page, 'api/v1/sap/functional', {
    page: 'fn_cut',
    title: 'Go-live',
    rows: [
      { id: 'cuta', act: 'Fecho do legado', phase: 'Cutover', dur: '60', st: 'todo' },
      { id: 'cutb', act: 'Carga de saldos', phase: 'Cutover', dur: '120', dep: 'cuta', st: 'todo' },
    ],
  });
  await page.goto(`app/fn-cut?r=${record.id}`);
  const st2 = page.getByLabel('Estado 2', { exact: true });
  await expect(st2.locator('option:checked')).toHaveText('Bloqueada');
  await expect(page.getByText('Crítica').first()).toBeVisible();
  await st2.selectOption('done');
  const dlg = page.getByRole('dialog', { name: 'Atividade bloqueada' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancelar' }).click();
  await expect(st2).toHaveValue('todo');
  // the predecessor done → no longer blocked
  await page.getByLabel('Estado 1', { exact: true }).selectOption('done');
  await expect(st2.locator('option:checked')).toHaveText('Por fazer');
  await st2.selectOption('done');
  await expect(page.getByRole('dialog', { name: 'Atividade bloqueada' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Cronograma' }).click();
  await expect(page.getByRole('img', { name: 'Cronograma' })).toBeVisible();
});
