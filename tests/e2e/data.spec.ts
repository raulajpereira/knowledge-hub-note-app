import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Batch C "data": "Exportar os meus dados" (request → ready → download; needs
// the worker), note history (restore) and saved views in the sidebar.
// its own address for the registration limit (10 an hour per IP)
test.use({
  locale: 'pt-PT',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.160' },
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `data-${Date.now()}@example.com`;
const password = 'Data-Strong-Pass-1';

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
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Data Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('export: request in Conta e Dados → ready → download the ZIP', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.request.post('api/v1/notes', { data: { title: 'Nota para exportar' } });
  await page.locator('.kh-acct').click();
  const card = page.locator('#kh-acc-export');
  await expect(card.getByText('Exportar os meus dados')).toBeVisible();
  await card.getByRole('button', { name: 'Pedir exportação' }).click();
  // pedido / a preparar → pronto (the worker builds it)
  await expect(card).toHaveAttribute('data-export-status', /pending|running|ready/);
  await expect(card).toHaveAttribute('data-export-status', 'ready', { timeout: 90_000 });
  const link = card.getByRole('link', { name: 'Descarregar ZIP' });
  const href = (await link.getAttribute('href'))!;
  expect(href).toMatch(/\/api\/v1\/me\/exports\/[0-9a-f-]{36}\/download$/);
  const res = await page.request.get(href.replace(/^\/v2\//, '').replace(/^\//, ''));
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/zip');
  const body = await res.body();
  expect(body.subarray(0, 2).toString()).toBe('PK');
  expect(body.includes(Buffer.from('notes/Sem caderno/Nota para exportar.md'))).toBe(true);
  // only signed in
  const anon = await page.context().browser()!.newContext();
  const r2 = await anon.request.get(new URL(href, page.url()).toString());
  expect(r2.status()).toBe(401);
  await anon.close();
  // the "export ready" email links into the app
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  await expect
    .poll(() => fs.readdirSync(outbox!).filter((f) => f.includes('-exportReady-') && f.includes(safe)).length)
    .toBe(1);
});

test('history: a note version is previewed and restored', async ({ page }) => {
  await login(page);
  const { note } = (await (
    await page.request.post('api/v1/notes', { data: { title: 'Plano go-live' } })
  ).json()) as {
    note: { id: string };
  };
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  // the first edit keeps the state before it ("Plano go-live", empty)
  await page.request.patch(`api/v1/notes/${note.id}`, { data: { content: doc('Primeira versão do plano') } });
  await page.request.patch(`api/v1/notes/${note.id}`, {
    data: { content: doc('Texto atual, depois mudado') },
  });
  await page.goto(`app/notes?n=${note.id}`);
  await expect(page.locator('.kh-nt-doc .kh-ne').first()).toContainText('Texto atual');
  await page.getByRole('button', { name: 'Histórico' }).click();
  const dlg = page.getByRole('dialog', { name: 'Histórico' });
  await expect(dlg.getByRole('option')).toHaveCount(1);
  await expect(dlg.locator('.kh-hist__title')).toHaveText('Plano go-live');
  await dlg.getByRole('button', { name: 'Restaurar esta versão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar esta versão' }).last().click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.kh-nt-editor .kh-nt-doc .kh-ne')).not.toContainText('Texto atual');
  // the state before the restore is now in the history
  await page.getByRole('button', { name: 'Histórico' }).click();
  await expect(dlg.getByRole('option')).toHaveCount(2);
  await expect(dlg.getByRole('option').first()).toContainText('Antes de restaurar');
  await expect(dlg.getByRole('option').first()).toContainText('Texto atual');
});

test('saved views: save the Notes filter and open it from the sidebar', async ({ page }) => {
  await login(page);
  for (const [title, tags] of [
    ['Transportes SAP', ['SAP']],
    ['Reunião Atlas', ['Atlas']],
  ] as const) {
    const { note } = (await (await page.request.post('api/v1/notes', { data: { title } })).json()) as {
      note: { id: string };
    };
    await page.request.patch(`api/v1/notes/${note.id}`, { data: { tags: [...tags] } });
  }
  await page.goto('app/notes');
  await page.getByRole('button', { name: 'Filtros' }).click();
  await page.locator('.kh-popover').getByRole('button', { name: 'SAP', exact: true }).click();
  await page.locator('.kh-popover').getByRole('button', { name: 'Últimos 30 dias' }).click();
  await expect(page).toHaveURL(/tag=SAP/);
  await expect(page.locator('.kh-nt-list .kh-nt-card')).toHaveCount(1);
  await page
    .locator('.kh-popover')
    .getByRole('button', { name: /Guardar vista/ })
    .click();
  const dlg = page.getByRole('dialog', { name: 'Guardar vista' });
  await dlg.getByLabel('Nome da vista').fill('SAP recente');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  const side = page.locator('.kh-vw');
  await expect(side.getByRole('link', { name: /SAP recente/ })).toContainText('1');
  await expect(page).toHaveURL(/view=[0-9a-f-]{36}/);

  // elsewhere, the sidebar opens it with its filters (a link: back/forward work)
  await page.goto('app/tasks');
  await side.getByRole('link', { name: /SAP recente/ }).click();
  await expect(page).toHaveURL(/\/app\/notes\?view=[0-9a-f-]{36}.*tag=SAP.*days=30/);
  await expect(page.locator('.kh-nt-list .kh-nt-card')).toHaveCount(1);
  await expect(page.locator('.kh-nt-list .kh-nt-card').first()).toContainText('Transportes SAP');
  await expect(side.getByRole('link', { name: /SAP recente/ })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/tasks/);
  await page.goForward();
  await expect(page.locator('.kh-nt-list .kh-nt-card')).toHaveCount(1);

  // rename and delete from the sidebar
  await side.locator('.kh-vw-row').first().hover();
  await side.getByRole('button', { name: /Opções da vista/ }).click();
  await page.getByRole('menuitem', { name: 'Mudar o nome' }).click();
  await page.getByRole('dialog').getByLabel('Nome da vista').fill('SAP (30 dias)');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(side.getByRole('link', { name: /SAP \(30 dias\)/ })).toBeVisible();
  await side.locator('.kh-vw-row').first().hover();
  await side.getByRole('button', { name: /Opções da vista/ }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(side).toHaveCount(0);
});
