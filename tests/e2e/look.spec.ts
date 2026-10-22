import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { paletteColors } from '@/lib/tags';

// Definições › Aparência: light theme (token + persistence), list density,
// start page; Tags page: chosen tag colour shown on a notes card.
// its own address for the registration limit (10 an hour per IP)
test.use({
  locale: 'pt-PT',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.161' },
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `look-${Date.now()}@example.com`;
const password = 'Look-Strong-Pass-1';

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
}

/** Waits until the prefs on the server have a value (the client saves debounced). */
async function prefIs(page: Page, key: string, value: unknown) {
  await expect
    .poll(async () => {
      const r = await page.request.get('api/v1/me/prefs');
      return ((await r.json()) as { prefs: Record<string, unknown> }).prefs[key];
    })
    .toEqual(value);
}

/** The glass select (it closes when the page scrolls, so the page is scrolled first). */
async function pickStart(page: Page, label: string) {
  const combo = page.getByRole('combobox', { name: 'Página inicial' });
  await combo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400); // let the scroll settle: scrolling closes the menu
  await combo.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(combo).toHaveText(label);
}

const rootVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Look Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('light theme: tokens switch and survive a reload', async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/app$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await rootVar(page, '--ink')).toBe('#fbf8f5');

  await page.goto('app/settings');
  await page.locator('[data-theme-opt="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await rootVar(page, '--ink')).toBe('#221a15');
  await prefIs(page, 'theme', 'light');

  await page.reload();
  // server-rendered from the cookie: light from the first paint
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await rootVar(page, '--ink')).toBe('#221a15');
  await expect(page.locator('[data-theme-opt="light"]')).toHaveAttribute('aria-pressed', 'true');

  // "system" follows prefers-color-scheme
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('[data-theme-opt="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await prefIs(page, 'theme', 'system');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.locator('[data-theme-opt="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('list density: compact sets data-density and persists', async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/app$/);
  await page.goto('app/settings');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');
  await page.locator('[data-density-opt="compact"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await prefIs(page, 'density', 'compact');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  // a list item is tighter than in the comfortable density
  await page.request.post('api/v1/tasks', { data: { title: 'Densa', type: 'tech' } });
  await page.goto('app/tasks');
  const item = page.locator('.kh-tk-item').first();
  await expect(item).toBeVisible();
  const compact = await item.evaluate((e) => getComputedStyle(e).paddingTop);
  await page.goto('app/settings');
  await page.locator('[data-density-opt="comfortable"]').click();
  await prefIs(page, 'density', undefined);
  await page.goto('app/tasks');
  const comfy = await page
    .locator('.kh-tk-item')
    .first()
    .evaluate((e) => getComputedStyle(e).paddingTop);
  expect(parseFloat(compact)).toBeLessThan(parseFloat(comfy));
});

test('start page: /app opens the chosen page; Início still reachable', async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/app$/);
  await page.goto('app/settings');
  await pickStart(page, 'Tarefas');
  await prefIs(page, 'startPage', 'tasks');

  await page.goto('app');
  await expect(page).toHaveURL(/\/app\/tasks(\?|$)/);
  await page.waitForLoadState('networkidle'); // the list selects its first task (?t=)
  // clicking Início inside the app shows Início
  await page.locator('aside.kh-aside').getByRole('link', { name: 'Início' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.kh-home')).toBeVisible();

  // after signing in too
  await page.context().clearCookies();
  await login(page);
  await page.waitForURL(/\/app\/tasks(\?|$)/);

  // last page used
  await page.goto('app/settings');
  await pickStart(page, 'Última página usada');
  await prefIs(page, 'startPage', 'last');
  await page.goto('app/notes');
  await prefIs(page, 'ui.lastPage', '/app/notes');
  await page.goto('app');
  await expect(page).toHaveURL(/\/app\/notes$/);
});

test('tag colour chosen on the Tags page shows on a notes card', async ({ page }) => {
  await login(page);
  await page.waitForURL(/\/app/);
  const r = await page.request.post('api/v1/notes', { data: { title: 'Nota com etiqueta' } });
  const { note } = (await r.json()) as { note: { id: string } };
  await page.request.patch(`api/v1/notes/${note.id}`, { data: { tags: ['Colorida'] } });

  await page.goto('app/tags');
  await page.getByRole('button', { name: 'Cor da etiqueta Colorida' }).click();
  await page.locator('[data-sw="2"]').click();
  await prefIs(page, 'tagColors', { colorida: 2 });

  await page.goto('app/notes');
  const chip = page.locator('.kh-nt-card .kh-tagc', { hasText: 'Colorida' }).first();
  await expect(chip).toBeVisible();
  expect(await chip.evaluate((e) => e.style.getPropertyValue('--tg-bg'))).toBe(paletteColors(2).bg);

  // back to automatic
  await page.goto('app/tags');
  await page.getByRole('button', { name: 'Cor da etiqueta Colorida' }).click();
  await page.locator('[data-sw="auto"]').click();
  await prefIs(page, 'tagColors', undefined);
});

test('text size is per device: kept on reload, not shown on another device', async ({ page, browser }) => {
  await login(page);
  // an earlier test made Notas the start page
  await page.waitForURL(/\/app(\/notes)?$/);
  await page.goto('app/settings');
  const font = page.getByRole('slider', { name: 'Tamanho do Texto' });
  await font.fill('1.15');
  await expect(page.locator('body')).toHaveCSS('font-size-adjust', '0.598');
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('font-size-adjust', '0.598');
  await expect(font).toHaveValue('1.15');
  // nothing written to the account
  const r = await page.request.get('api/v1/me/prefs');
  expect(((await r.json()) as { prefs: Record<string, unknown> }).prefs.fontScale).toBeUndefined();

  const other = await browser.newPage({
    locale: 'pt-PT',
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.161' },
  });
  await login(other);
  await other.waitForURL(/\/app(\/notes)?$/);
  await other.goto('app/settings');
  await expect(other.getByRole('slider', { name: 'Tamanho do Texto' })).toHaveValue('1');
  await expect(other.locator('body')).not.toHaveCSS('font-size-adjust', '0.598');
  await other.close();
});
