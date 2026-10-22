import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Phones, phase 4 (D71): Management (Recursos list → person → back, the
// allocations grid sliding inside its own box, a timesheet day filled in) and
// the Admin Console (its menu as a drawer, a list → code drawer → back).
const PHONE = {
  locale: 'pt-PT',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.181' },
};
test.use(PHONE);
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `mobile4-${Date.now()}@example.com`;
const password = 'Mobile-Strong-Pass-4';

const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string) {
  let bits = 0;
  let v = 0;
  const key: number[] = [];
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    v = (v << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      key.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(key)).update(c).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

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

type Mg = {
  people: Array<{ id: string; name: string; role: string }>;
  ts: Array<{ person: string; week: string; rows: Record<string, number[]> }>;
};
const mgData = async (page: Page) => (await (await page.request.get('api/v1/mg')).json()) as Mg;

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'MANAGEMENT'))![0];
  const page = await browser.newPage(PHONE);
  await page.goto('register');
  await page.getByLabel('Nome').fill('Mobile Quatro');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  // the sample data set (Definições › Management › Repor Dados), on a computer-sized page
  const desk = await browser.newPage({
    locale: 'pt-PT',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: PHONE.extraHTTPHeaders,
  });
  await login(desk);
  await desk.goto('app/settings');
  await desk.getByRole('tab', { name: 'Management' }).click();
  desk.once('dialog', (d) => void d.accept());
  await desk.getByRole('button', { name: 'Repor Dados' }).click();
  await expect(desk.getByText('16 pessoas')).toBeVisible();
  await expect.poll(async () => (await mgData(desk)).people.length).toBe(38);
  await desk.close();
});

test('Recursos: list → person (edit a field) → back, also with the browser Back', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-people');
  // the list alone, nothing opens by itself
  await expect(page.getByRole('heading', { name: 'Recursos' })).toBeVisible();
  await expect(page.locator('.kh-mback')).toHaveCount(0);
  await noSideScroll(page);
  const first = (await mgData(page)).people[0]!;
  await page.locator('.mg-msplit [role=button]', { hasText: first.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`\\?p=${first.id}`));
  // the person is the page: "← Voltar" on top, no list, no team bar
  await expect(page.locator('.kh-mback')).toContainText(first.name);
  await expect(page.getByRole('heading', { name: 'Recursos' })).toBeHidden();
  await expect(page.locator('.mg-teambar')).toBeHidden();
  await noSideScroll(page);
  // a simple edit still works with touch
  await page.getByLabel('Função', { exact: true }).fill('Consultor Móvel');
  await expect
    .poll(async () => (await mgData(page)).people.find((p) => p.id === first.id)?.role)
    .toBe('Consultor Móvel');
  // ← Voltar
  await page.locator('.kh-mback__btn').click();
  await expect(page).not.toHaveURL(/\?p=/);
  await expect(page.getByRole('heading', { name: 'Recursos' })).toBeVisible();
  // and the browser's (Android's) Back
  await page.locator('.mg-msplit [role=button]', { hasText: first.name }).first().click();
  await expect(page.locator('.kh-mback')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Recursos' })).toBeVisible();
  await expect(page.locator('.kh-mback')).toHaveCount(0);
});

test('Alocações: the grid slides inside its box, the names stay; editing is for a computer', async ({
  page,
}) => {
  await login(page);
  await page.goto('app/mg-alloc?mode=heat');
  await expect(page.getByRole('heading', { name: 'Alocações' })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText('Editar no computador');
  await expect(page.getByRole('button', { name: '+ Nova Alocação' })).toHaveCount(0);
  await noSideScroll(page);
  const name = (await mgData(page)).people[0]!.name;
  const cell = page.locator('.mg-alname', { hasText: name }).first();
  const box = page
    .locator('.mg-alname')
    .first()
    .locator('xpath=ancestor::div[contains(@style,"overflow")][1]');
  expect(await box.evaluate((e) => e.scrollWidth > e.clientWidth + 200)).toBe(true);
  const x0 = (await cell.boundingBox())!.x;
  await box.evaluate((e) => (e.scrollLeft = 600));
  await expect.poll(async () => box.evaluate((e) => e.scrollLeft)).toBeGreaterThan(500);
  // the name column is sticky, the page itself did not move
  expect(Math.abs((await cell.boundingBox())!.x - x0)).toBeLessThan(2);
  await noSideScroll(page);
  // a cell opens its projects in a sheet (to read)
  await page.locator('.mg-alrow button[aria-label]').first().click();
  const sheet = page.locator('.kh-sheet-panel');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('input')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toBeHidden();
});

test('Folhas de Tempos: a person → one day filled in', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-time');
  await page.getByRole('tab', { name: 'Por Pessoa' }).click();
  await page.locator('.mg-msplit [role=button]').first().click();
  await expect(page).toHaveURL(/\?p=/);
  await expect(page.locator('.kh-mback')).toBeVisible();
  const pid = new URL(page.url()).searchParams.get('p')!;
  // a submitted week is reopened first (the sample data has some)
  const reopen = page.getByRole('button', { name: 'Reabrir' });
  if (await reopen.isVisible()) await reopen.click();
  await expect(page.getByRole('button', { name: 'Submeter Semana' })).toBeVisible();
  // Tuesday: one field per project, 44 px tall
  await page.getByRole('tab', { name: /^Ter/ }).click();
  const field = page.locator('.mg-mdetail input[type=number]').first();
  expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await field.fill('6');
  await expect
    .poll(async () =>
      (await mgData(page)).ts.some((e) => e.person === pid && Object.values(e.rows).some((r) => r[1] === 6)),
    )
    .toBe(true);
  await expect(field).toHaveValue('6');
  await noSideScroll(page);
});

test('Consola: the menu is a drawer; a code opens as a page and Back closes it', async ({ page }) => {
  cli('admins:grant', '--email', email, '--role', 'admin');
  await login(page);
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const setup = (await (await page.request.post(`${base}/api/v1/auth/2fa/setup`, { data: {} })).json()) as {
    secret: string;
  };
  expect(
    (await page.request.post(`${base}/api/v1/auth/2fa/enable`, { data: { code: totp(setup.secret) } })).ok(),
  ).toBe(true);
  await page.goto('admin');
  await expect(page.getByRole('heading', { name: 'Visão Geral' })).toBeVisible();
  await noSideScroll(page);
  // the console's navigation: a drawer from ☰ (Back closes it too)
  const drawer = page.locator('#kh-ad-navdrawer');
  await expect(drawer).not.toHaveAttribute('data-open');
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(drawer).toHaveAttribute('data-open', 'true');
  await page.goBack();
  await expect(drawer).not.toHaveAttribute('data-open');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Menu' }).click();
  await drawer.getByRole('button', { name: 'Códigos' }).click();
  await expect(drawer).not.toHaveAttribute('data-open');
  await expect(page.getByRole('heading', { name: 'Códigos', exact: true })).toBeVisible();
  await noSideScroll(page);

  // the table is one card per code; a card opens the code as a page
  const card = page.locator('.kh-ad-crd').first();
  const code = (await card.locator('.kh-ad-td__main').first().textContent())!;
  await card.click();
  const pane = page.locator('.kh-ad-drawer--m');
  await expect(pane.getByRole('heading', { name: code })).toBeVisible();
  await expect(pane.locator('.kh-mback')).toBeVisible();
  // Android's/iOS's Back closes it and stays in Códigos
  await page.goBack();
  await expect(pane).toHaveCount(0);
  await expect(page).toHaveURL(/s=codes/);
  // ← Voltar too
  await card.click();
  await expect(pane).toBeVisible();
  await pane.locator('.kh-mback__btn').click();
  await expect(pane).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Códigos', exact: true })).toBeVisible();
});
