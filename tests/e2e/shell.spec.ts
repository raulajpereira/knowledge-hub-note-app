import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 3.1 shell: plan-gated sidebar, server-side module gate, synced
// column width (user_prefs), lock screen with server re-auth, account modal.
test.use({ locale: 'pt-PT' });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `shell-${Date.now()}@example.com`;
const password = 'Shell-Strong-Pass-1';

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
    {
      encoding: 'utf8',
    },
  );
  const code = /KH-LIC-\d{6}/.exec(out)![0];
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Shell Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('sidebar shows only the plan’s modules; the server gates the rest', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('complementary', { name: 'Navigation' });
  await expect(nav.getByRole('link', { name: 'Notas', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Calendário' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Visão Geral' })).toHaveCount(0); // Management isn't in PRO
  await expect(nav.getByRole('button', { name: 'SAP' })).toHaveCount(0);

  await nav.getByRole('link', { name: 'Notas', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(nav.getByRole('link', { name: 'Notas', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('chega numa próxima fase')).toBeVisible();

  await page.goto('app/mg-overview');
  await expect(page.getByText('não está incluído no seu plano')).toBeVisible();
  expect((await page.goto('app/not-a-module'))?.status()).toBe(404);
  expect((await page.goto('admin'))?.status()).toBe(404);
});

test('sidebar width syncs through user_prefs (another browser sees it)', async ({ page, browser }) => {
  await login(page);
  const handle = page.locator('.kh-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 68, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.kh-main')).toHaveCSS('grid-template-columns', /^296px /);
  await page.waitForTimeout(1200); // debounce → PUT /me/prefs

  const other = await browser.newPage({ locale: 'pt-PT' });
  await login(other);
  await expect(other.locator('.kh-main')).toHaveCSS('grid-template-columns', /^296px /);
  await other.locator('.kh-handle').dblclick();
  await expect(other.locator('.kh-main')).toHaveCSS('grid-template-columns', /^236px /);
  await other.close();
});

test('lock screen re-authenticates on the server and survives a reload', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Bloquear App' }).click();
  const lock = page.getByRole('dialog', { name: 'O KnowledgeHub está bloqueado' });
  await expect(lock).toBeVisible();
  await page.reload();
  await expect(lock).toBeVisible();
  await lock.getByPlaceholder('Password').fill('wrong-password');
  await lock.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(lock.getByText('Password incorreta.')).toBeVisible();
  await lock.getByPlaceholder('Password').fill(password);
  await lock.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(lock).toHaveCount(0);
});

test('focus mode, about and account (rename, sessions)', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Modo Foco' }).click();
  await expect(page.getByRole('complementary', { name: 'Navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Modo Foco' }).click();

  await page.getByRole('button', { name: 'Sobre' }).click();
  await expect(page.getByText('VERSÃO 2.0.0')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTitle('Conta e Dados').click();
  const dlg = page.getByRole('dialog', { name: 'Conta e Dados' });
  await expect(dlg.getByText('Esta Sessão')).toBeVisible();
  const name = dlg.locator('input').first();
  await name.fill('Shell Renamed');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg.getByRole('button', { name: /Guardado/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTitle('Conta e Dados')).toContainText('Shell Renamed');
});
