import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The header's global search: results from every module appear and refine
// while typing (no Enter), accents either way, keyboard navigation, Enter for
// the full results page, a slow older answer never replaces a newer one, and
// the phone's search bar.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `gsearch-${Date.now()}@example.com`;
const password = 'Global-Search-Pass-1';
const BOX = 'Pesquisar notas, objetos, transações…';

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

const results = (page: Page) => page.locator('#kh-gs-pop [role="option"].kh-gs__row');

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  // its own address for the registration limit (10 an hour per IP)
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.191' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Global Search');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  cli('tenants:module', '--email', email, '--add', 'transports');
  await login(page);
  for (const title of ['Reunião de kickoff S/4HANA', 'Notas da reuniao com o cliente', 'Arquitetura'])
    expect((await page.request.post('api/v1/notes', { data: { title } })).ok()).toBe(true);
  expect(
    (await page.request.post('api/v1/tasks', { data: { title: 'Preparar REUNIÃO de steering' } })).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('api/v1/meetings', {
        data: { title: 'Reunião semanal da equipa', heldOn: '2026-10-20' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('api/v1/sap/transports', {
        data: {
          trkorr: 'DEVK900123',
          description: 'Relatório de reuniões',
          clientId: null,
          projectId: null,
          systemId: null,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.close();
});

test('results appear and refine while typing, without Enter', async ({ page }) => {
  await login(page);
  const box = page.getByRole('searchbox', { name: BOX });
  await box.click();
  // one letter: titles with a word starting with it, from every module
  await box.pressSequentially('r', { delay: 60 });
  await expect(results(page).filter({ hasText: 'Reunião de kickoff' })).toBeVisible();
  await expect(results(page).filter({ hasText: 'Preparar REUNIÃO de steering' })).toBeVisible();
  await expect(results(page).filter({ hasText: 'Arquitetura' })).toHaveCount(0);
  // grouped by module with counts
  await expect(page.locator('#kh-gs-pop [role="group"][aria-label="Notas"] .kh-gs__gcount')).toHaveText('2');
  await expect(page.locator('#kh-gs-pop [role="group"][aria-label="Ordens de Transporte"]')).toBeVisible();

  await box.pressSequentially('euni', { delay: 60 });
  await expect(results(page)).toHaveCount(5);
  // the typed text is highlighted, accents or not
  await expect(results(page).first().locator('mark')).toHaveText(/reuni/i);
  // a second word narrows it (every word must match)
  await box.pressSequentially('ao cli', { delay: 60 });
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toContainText('Notas da reuniao com o cliente');
  // deleting characters widens it again
  for (let i = 0; i < 4; i++) await box.press('Backspace');
  await expect(results(page)).toHaveCount(4);
  // the accented spelling finds the plain one and vice versa
  await box.fill('reunião');
  await expect(results(page).filter({ hasText: 'Notas da reuniao com o cliente' })).toBeVisible();
  await box.fill('arquitetura semanal');
  await expect(page.locator('#kh-gs-pop .kh-gs__empty')).toHaveText(
    'Sem resultados para “arquitetura semanal”',
  );
  // Escape closes the list; typing opens it again
  await box.fill('kickoff');
  await expect(results(page)).toHaveCount(1);
  await box.press('Escape');
  await expect(page.locator('#kh-gs-pop')).toHaveCount(0);
  await box.press('Backspace');
  await expect(results(page)).toHaveCount(1);
});

test('keyboard: ↑/↓ choose, Enter opens the item or the results page', async ({ page }) => {
  await login(page);
  const box = page.getByRole('searchbox', { name: BOX });
  await box.fill('reuni');
  await expect(results(page)).toHaveCount(5);
  await box.press('ArrowDown');
  await box.press('ArrowDown');
  const second = results(page).nth(1);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(box).toHaveAttribute('aria-activedescendant', (await second.getAttribute('id'))!);
  const title = (await second.locator('.kh-gs__title').innerText()).trim();
  await box.press('Enter');
  await page.waitForURL(/\/app\/notes\?n=/);
  await expect(page.getByLabel('Sem título')).toHaveValue(title);
  await expect(box).toHaveValue('');

  // nothing chosen: Enter opens every result, grouped, with a chip per module
  await box.fill('reuni');
  await expect(results(page)).toHaveCount(5);
  await box.press('Enter');
  await page.waitForURL(/\/app\/search\?q=reuni$/);
  await expect(page.getByRole('heading', { name: 'Pesquisa' })).toBeVisible();
  await expect(page.locator('.kh-gsp__sub')).toHaveText('5 resultados para “reuni”');
  await expect(page.locator('#kh-gs-pop')).toHaveCount(0);
  // the header box keeps refining the page live, and the URL follows
  await box.pressSequentially('ao', { delay: 60 });
  await expect(page.locator('.kh-gsp__sub')).toHaveText('4 resultados para “reuniao”');
  await expect(page).toHaveURL(/\/app\/search\?q=reuniao$/);
  await page
    .locator('.kh-gsp__chips')
    .getByRole('button', { name: /Tarefas/ })
    .click();
  await expect(page.locator('.kh-gsp__group')).toHaveCount(1);
  await expect(page.locator('.kh-gsp__group')).toContainText('Preparar REUNIÃO de steering');
  await expect(page).toHaveURL(/type=task/);
  // a reload keeps the query and the chosen module
  await page.reload();
  await expect(box).toHaveValue('reuniao');
  await expect(page.locator('.kh-gsp__group')).toHaveCount(1);
});

test('a slow answer for older text never replaces the newer results', async ({ page }) => {
  await login(page);
  let slowSeen = false;
  await page.route('**/api/v1/search?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q !== 'reu') return route.continue();
    slowSeen = true;
    await new Promise((r) => setTimeout(r, 1500));
    // what the old request would have shown
    await route
      .fulfill({
        json: {
          q: 'reu',
          groups: [
            {
              type: 'note',
              module: 'notes',
              count: 1,
              items: [{ id: 'x', title: 'Resposta antiga', snippet: '', at: '' }],
            },
          ],
        },
      })
      .catch(() => {});
  });
  const box = page.getByRole('searchbox', { name: BOX });
  await box.click();
  await box.pressSequentially('reu', { delay: 30 });
  await expect.poll(() => slowSeen).toBe(true);
  await box.pressSequentially('ni', { delay: 30 });
  await expect(results(page)).toHaveCount(5);
  await page.waitForTimeout(2000);
  await expect(results(page)).toHaveCount(5);
  await expect(page.getByText('Resposta antiga')).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the search bar shows live results that fit the screen', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).tap();
    const box = page.getByRole('searchbox', { name: BOX });
    await expect(box).toBeFocused();
    await box.pressSequentially('reu', { delay: 80 });
    await expect(results(page)).toHaveCount(5);
    const pop = (await page.locator('#kh-gs-pop').boundingBox())!;
    expect(pop.x).toBeGreaterThanOrEqual(0);
    expect(pop.x + pop.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await results(page).filter({ hasText: 'Preparar REUNIÃO de steering' }).tap();
    await page.waitForURL(/\/app\/tasks\?t=/);
    // the results page has its own box on phones
    await page.goto('app/search?q=reuni');
    await expect(page.locator('.kh-gsp__sub')).toHaveText('5 resultados para “reuni”');
    await page.getByRole('searchbox', { name: 'Pesquisa', exact: true }).fill('reuniao cliente');
    await expect(page.locator('.kh-gsp__group')).toHaveCount(1);
  });
});
