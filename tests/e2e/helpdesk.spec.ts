import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Helpdesk: the extension (played here through its API with the token the page hands it) links a list;
// set up, preview and import it; a later read with changes shows the popup on any page and the bell.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `helpdesk-${Date.now()}@example.com`;
const password = 'Helpdesk-Strong-Pass-1';

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
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'SAP'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    // own IP: the register limit (10/h per IP) is shared by every spec without one
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.220' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Helpdesk Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const H = [
  'Assunto',
  'Tarefa Pai',
  'Atribuído a',
  'Estado',
  'Prioridade',
  'Tipo',
  'Reportado por',
  'Último comentário',
  'Cliente',
];
const R = (n: string, s: string, st: string, pr = 'Média', c = '–') => [
  `#${n} ${s}`,
  '–',
  'Raul Pereira',
  st,
  pr,
  'Incidente',
  'Sara Abrunhosa (05/11/2026 14:49)',
  c,
  'Cliente E2E',
];
const PAGE = 'https://helpdesk.example/my-page';
const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`) });
};

test('link a helpdesk list, import it, and see the changes of a later read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto('app/helpdesk');
  await expect(page.getByRole('heading', { name: 'Helpdesk' })).toBeVisible();
  await expect(page.getByText('Ligar o helpdesk em 4 passos')).toBeVisible();
  await shot(page, '1-vazio');

  // the token the page hands to the extension; then "Ligar esta lista" as the extension sends it
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const token = await page.evaluate(async (b) => {
    const r = await fetch(`${b}/api/v1/helpdesk/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return ((await r.json()) as { token: string }).token;
  }, base);
  const ext = (p: string, data: unknown) =>
    page.request.post(`api/ext/v1/helpdesk${p}`, {
      headers: { Authorization: `Bearer ${token}`, Origin: 'chrome-extension://abc' },
      data,
    });
  const first = [
    R('146975', 'Solicitação de Desenvolvimento de Relatório', 'Pendente-Cliente'),
    R('146233', 'Solicitação de regularização da integração', 'Aberto', 'Baixa'),
    R('146205', 'Atribuição de acesso ao Monitor de Replicação', 'Aberto'),
  ];
  const snap = await ext('/snapshot', {
    url: PAGE,
    title: 'Helpdesk ID4S — Atribuído a mim',
    headers: H,
    rows: first,
  });
  expect(snap.status()).toBe(201);
  const { id, setupUrl } = (await snap.json()) as { id: string; setupUrl: string };
  await page.goto(setupUrl.replace(/^https?:\/\/[^/]+/, '').replace(new RegExp(`^${base}/`), ''));
  const setup = page.getByRole('dialog', { name: 'Ligar lista de tickets' });
  await expect(setup.getByLabel('Assunto · Campo')).toContainText('Nº + Descrição');
  await expect(setup.getByLabel('Cliente · Campo')).toContainText('Cliente');
  await shot(page, '2-ligar');
  await setup.getByRole('button', { name: 'Pré-visualizar' }).click();
  const prev = page.getByRole('dialog', { name: 'Pré-visualizar' });
  await expect(prev).toContainText('#146975');
  await shot(page, '3-previsualizar');
  await prev.getByRole('button', { name: /Importar 3/ }).click();
  await expect(page.getByRole('row', { name: /146233/ })).toBeVisible();
  await expect(page.getByText(/sincronizado às/)).toBeVisible();

  // a later read (every 15 minutes): a state, a priority and a comment changed, one new, one left
  const r = await ext(`/sources/${id}/sync`, {
    url: PAGE,
    headers: H,
    rows: [
      R(
        '146975',
        'Solicitação de Desenvolvimento de Relatório',
        'Em progresso',
        'Alta',
        'Raul Pereira (18/11/2026 10:05)',
      ),
      R('146233', 'Solicitação de regularização da integração', 'Aberto', 'Baixa'),
      R('147010', 'Erro na replicação EC → ECP', 'Aberto'),
      R('145782', 'HCM_PT_Integração - Erro de integração', 'Reaberto'),
      R('143604', 'Solicitação de Abertura de Pedido', 'Fechado'),
    ],
  });
  expect(((await r.json()) as { changes: number }).changes).toBe(7);
  await page.goto('app');
  const pop = page.getByRole('alertdialog', { name: /Helpdesk: 5 ticket/ });
  await expect(pop).toContainText('Estado: Pendente-Cliente → Em progresso');
  await expect(pop).toContainText('Novo comentário de Raul Pereira (18/11 10:05)');
  await expect(pop).toContainText('Saiu da lista do helpdesk');
  await shot(page, '4-popup');
  await page
    .getByRole('button', { name: /Notificações/ })
    .first()
    .click()
    .catch(() => {});
  await shot(page, '5-sino');
  await page.keyboard.press('Escape');
  await pop.getByRole('button', { name: 'OK' }).click();
  await expect(pop).toHaveCount(0);

  await page.goto('app/helpdesk');
  await expect(page.getByRole('row', { name: /146205/ })).toContainText('fora da lista');
  // Aberto / Reaberto / Em progresso first, then the rest, the ones that left the list last
  const order = await page.locator('.kh-hd-table [role=row][tabindex] > :first-child').allInnerTexts();
  expect(order.indexOf('#143604')).toBeGreaterThan(order.indexOf('#145782'));
  expect(order.at(-1)).toBe('#146205');
  await expect(page.locator('.kh-hd-st[data-k=reopen]')).toHaveText('Reaberto');
  // filters: "Prioritários" keeps Aberto / Reaberto / Em progresso (in the list)
  await page.getByRole('combobox', { name: 'Estado' }).click();
  await page.getByRole('option', { name: /^Só prioritários/ }).click();
  await expect(page.locator('.kh-hd-table [role=row][tabindex]')).toHaveCount(4);
  await expect(page.getByText('4 de 6')).toBeVisible();
  await shot(page, '6b-filtros');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('.kh-hd-table [role=row][tabindex]')).toHaveCount(6);
  await shot(page, '6-lista');
  await page.getByRole('radio', { name: 'Modificações' }).click();
  await expect(page.getByText('Prioridade: Média → Alta')).toBeVisible();
  await shot(page, '7-modificacoes');
  // a change opens its ticket
  await page.getByText('Prioridade: Média → Alta').click();
  const fromChange = page.getByRole('dialog', { name: '#146975' });
  await expect(fromChange).toContainText('Histórico');
  await fromChange.getByRole('button', { name: 'Fechar' }).last().click();
  await expect(fromChange).toHaveCount(0);
  await page.getByRole('radio', { name: 'Tickets' }).click();
  await page.getByRole('row', { name: /146975/ }).click();
  await expect(page.getByRole('dialog', { name: '#146975' })).toContainText('Histórico');
  await shot(page, '8-ticket');
});
