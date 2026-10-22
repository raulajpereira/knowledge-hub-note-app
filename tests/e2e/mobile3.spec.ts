import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phones, phase 3 (D70): Biblioteca de Código SAP (list → object → back, the
// node tree in a sheet), the header's SAP TCodes as a sheet, API Playground
// (send from the compact URL row), Tarefas de Projeto (card → task → back,
// one Kanban column at a time) and Quadro (opens a board, boards in a sheet).
const PHONE = {
  locale: 'pt-PT',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.172' },
};
test.use(PHONE);
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `mobile3-${Date.now()}@example.com`;
const password = 'Mobile-Strong-Pass-3';

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

/** No horizontal page scroll on the phone. */
async function noSideScroll(page: Page) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(w).toBeLessThanOrEqual(0);
}

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'SAP'))![0];
  const page = await browser.newPage(PHONE);
  await page.goto('register');
  await page.getByLabel('Nome').fill('Mobile Três');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  for (const m of ['codelib', 'tcodes', 'api', 'issues', 'whiteboard'])
    cli('tenants:module', '--email', email, '--add', m);
});

test('Biblioteca de Código SAP: list → object (node tree in a sheet) → back', async ({ page }) => {
  await login(page);
  await page.goto('app/codelib');
  // a program, made from the list
  await page.getByRole('button', { name: 'Novo Objeto' }).click();
  await page.getByRole('menuitem', { name: /Programas/ }).click();
  await expect(page).toHaveURL(/\?o=/);
  const name = page.getByLabel('Objeto de Código');
  await name.fill('zmob test');
  await expect(name).toHaveValue('ZMOB_TEST');
  // the object is the whole page: no list beside it, "← Voltar" on top
  await expect(page.locator('.kh-cl-list')).toBeHidden();
  await expect(page.locator('.kh-mback')).toBeVisible();
  await noSideScroll(page);

  // the node tree opens in a sheet from the picker; picking a node closes it
  await page.locator('.kh-cl-npick').click();
  const sheet = page.getByRole('dialog', { name: 'Estrutura' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Atributos' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.kh-cl-npick')).toContainText('Atributos');
  // back to the code: the editor scrolls inside its box, not the page
  await page.locator('.kh-cl-npick').click();
  await page
    .getByRole('dialog', { name: 'Estrutura' })
    .getByRole('button', { name: /ZMOB_TEST/ })
    .click();
  const ta = page.getByRole('textbox', { name: 'ZMOB_TEST' });
  await expect(ta).toBeVisible();
  await ta.fill(`REPORT zmob_test.\n${'WRITE / ' + "'x'".repeat(60) + '.'}`);
  await noSideScroll(page);
  expect(await page.locator('.kh-cl-node .kh-ab').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);

  // ← back to the list (and Android's Back too)
  await page.locator('.kh-mback__btn').click();
  await expect(page).not.toHaveURL(/\?o=/);
  await expect(page.locator('.kh-cl-list')).toBeVisible();
  await page.locator('.kh-cl-item', { hasText: 'ZMOB_TEST' }).click();
  await expect(page.locator('.kh-cl-main')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.kh-cl-list')).toBeVisible();
  await expect(page.locator('.kh-cl-main')).toBeHidden();
});

test('SAP TCodes from the menu: a sheet; the page: card → transaction → back', async ({ page }) => {
  await login(page);
  await page.goto('app/tcodes');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.kh-navdrawer').getByRole('button', { name: 'SAP TCodes' }).click();
  const sheet = page.getByRole('dialog', { name: 'SAP TCodes' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveClass(/kh-sheet-panel/);
  await sheet.getByLabel('Transação, programa, descrição, módulo…').fill('se38');
  await expect(sheet.locator('.kh-tcp__list > button').first()).toContainText('SE38');
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toBeHidden();

  // the table is one card per transaction; a card opens it full-screen
  await page.getByLabel('Procurar transação, descrição, programa…').fill('SE38');
  const card = page.locator('.kh-table-card', { hasText: 'SE38' }).first();
  await card.click();
  await expect(page).toHaveURL(/\?x=/);
  await expect(page.locator('.kh-sap-main')).toBeHidden();
  await expect(page.locator('.kh-sap-panel .kh-mback')).toContainText('SE38');
  await noSideScroll(page);
  await page.locator('.kh-mback__btn').click();
  await expect(page.locator('.kh-sap-main')).toBeVisible();
  await expect(page).not.toHaveURL(/\?x=/);
});

test('API Playground: folders in a sheet, URL + method + Send in one row, a response', async ({ page }) => {
  await login(page);
  await page.goto('app/api');
  await page.locator('.kh-mfolders').click();
  const folders = page.getByRole('dialog', { name: 'Pastas' });
  await folders.getByLabel('Nome da pasta').fill('Telemóvel');
  await folders.getByRole('button', { name: /Nova Pasta/ }).click();
  await folders.getByRole('button', { name: 'Telemóvel', exact: true }).click();
  await expect(folders).toBeHidden();
  await expect(page.locator('.kh-mfolders')).toContainText('Telemóvel');

  await page.getByRole('button', { name: 'Novo Pedido' }).click();
  await expect(page).toHaveURL(/\?r=/);
  await expect(page.locator('.kh-em-side')).toBeHidden();
  const bar = page.locator('.kh-ap-bar');
  const url = bar.getByLabel('URL', { exact: true });
  await url.fill('http://127.0.0.1:8080/ping');
  // method, URL and Send share one row
  const [m, u, s] = await Promise.all(
    ['.kh-ap-method', '.kh-ap-url', '.kh-ap-send'].map(
      async (sel) => (await bar.locator(sel).boundingBox())!,
    ),
  );
  expect(Math.abs(m!.y - s!.y)).toBeLessThan(4);
  expect(u!.width).toBeGreaterThan(140);
  await noSideScroll(page);

  // the server proxy answers (private address refused); then a mocked 200
  await bar.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('.kh-ap-error')).toContainText('Endereço bloqueado');
  await page.route('**/api/v1/api-requests/send', (r) =>
    r.fulfill({
      json: {
        ok: true,
        response: {
          status: 200,
          statusText: 'OK',
          ms: 9,
          truncated: false,
          body: '{"ok":true}',
          headers: [['content-type', 'application/json']],
        },
      },
    }),
  );
  await bar.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('tab', { name: /Resposta/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.kh-ap-respbody')).toContainText('"ok"');
  await expect(page.locator('.kh-ap-rh')).toContainText('application/json');
  await noSideScroll(page);
  await page.locator('.kh-mback__btn').click();
  await expect(page.locator('.kh-em-side')).toBeVisible();
});

test('Tarefas de Projeto: card → task → back; Kanban one column at a time', async ({ page }) => {
  await login(page);
  await page.goto('app/issues');
  await page.getByRole('button', { name: 'Novo Problema' }).click();
  await expect(page).toHaveURL(/\?i=/);
  await expect(page.locator('.kh-is-main')).toBeHidden();
  await page.getByLabel('Título').fill('Tarefa no telemóvel');
  await page.locator('.kh-mback__btn').click();
  await expect(page.locator('.kh-is-main')).toBeVisible();
  // the table rows are cards
  const card = page.locator('.kh-is-mlist .kh-is-card', { hasText: 'Tarefa no telemóvel' });
  await expect(card).toBeVisible();
  await expect(page.locator('.kh-is-table')).toHaveCount(0);
  await card.click();
  await expect(page.locator('.kh-is-panel')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.kh-is-panel')).toHaveCount(0);

  // Kanban: one column, switched by the tabs (or a swipe)
  await page.getByRole('radio', { name: 'Kanban' }).click();
  const tabs = page.getByRole('tablist', { name: 'Kanban' });
  await expect(tabs.getByRole('tab', { name: /Aberto/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.kh-is-mlist .kh-is-card', { hasText: 'Tarefa no telemóvel' })).toBeVisible();
  await tabs.getByRole('tab', { name: /Em Curso/ }).click();
  await expect(page.locator('.kh-is-mlist .kh-is-card')).toHaveCount(0);
  await noSideScroll(page);
  await page.getByRole('radio', { name: 'Tabela' }).click();
});

test('Quadro: opens a board, the boards list in a sheet, pinch zoom', async ({ page }) => {
  await login(page);
  await page.goto('app/whiteboard');
  await expect(page.getByLabel('Nome do quadro')).toHaveValue('Quadro sem título 1');
  await expect(page.getByTestId('wb-canvas')).toBeVisible();
  await noSideScroll(page);
  // the tools are one row at the bottom
  const tools = (await page.locator('.kh-wb-tools').boundingBox())!;
  expect(tools.width).toBeGreaterThan(tools.height);

  await page.getByRole('button', { name: 'Quadros' }).click();
  const sheet = page.getByRole('dialog', { name: 'Quadros' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /Novo quadro/ }).click();
  await expect(page.getByLabel('Nome do quadro')).toHaveValue('Quadro sem título 2');

  // two fingers apart: zoom in (CDP touch events on the canvas)
  const zoom = page.locator('.kh-wb-zlbl');
  const z0 = await zoom.textContent();
  const box = (await page.getByTestId('wb-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - d, y: cy, id: 1 },
              { x: cx + d, y: cy, id: 2 },
            ],
    });
  await touch('touchStart', 40);
  for (const d of [60, 80, 100, 120]) await touch('touchMove', d);
  await touch('touchEnd', 0);
  await expect(zoom).not.toHaveText(z0 ?? '');
});
