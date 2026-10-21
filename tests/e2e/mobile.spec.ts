import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phones (D68): compact header + drawer, bottom bar with the "+" quick
// capture, and list → detail → back on Notas / Tarefas (the URL param keeps
// the browser's Back working).
const PHONE = {
  locale: 'pt-PT',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.170' },
};
test.use(PHONE);
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `mobile-${Date.now()}@example.com`;
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
  await page.getByLabel('Nome').fill('Mobile Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Navegação principal' });

test('compact header: the drawer opens, closes with Escape / a link, and has the sidebar', async ({
  page,
}) => {
  await login(page);
  // no desktop sidebar or ticker on a phone
  await expect(page.locator('.kh-main > .kh-aside')).toHaveCount(0);
  await expect(page.locator('.kh-ticker')).toHaveCount(0);

  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toHaveCount(0); // closed: inert + aria-hidden
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Notas', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await drawer.getByRole('link', { name: 'Tarefas', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/tasks/);
  await expect(drawer).toHaveCount(0);

  // the backdrop closes it too
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(drawer).toBeVisible();
  await page.locator('.kh-navdrawer__dim').click({ position: { x: 370, y: 400 } });
  await expect(drawer).toHaveCount(0);
});

test('bottom bar navigates between Início, Notas, Tarefas and Calendário', async ({ page }) => {
  await login(page);
  const bar = tabs(page);
  await expect(bar.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
  await bar.getByRole('link', { name: 'Notas' }).click();
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(bar.getByRole('link', { name: 'Notas' })).toHaveAttribute('aria-current', 'page');
  await bar.getByRole('link', { name: 'Tarefas' }).click();
  await expect(page).toHaveURL(/\/app\/tasks$/);
  await bar.getByRole('link', { name: 'Calendário' }).click();
  await expect(page).toHaveURL(/\/app\/calendar$/);
  // the day agenda with its day switcher
  await expect(page.getByRole('button', { name: 'Dia seguinte' })).toBeVisible();
  await bar.getByRole('link', { name: 'Início' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('"+" sheet creates a note and opens it', async ({ page }) => {
  await login(page);
  await tabs(page).getByRole('button', { name: 'Criar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Criar' });
  await expect(sheet.getByRole('button', { name: 'Registo de reunião' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Nova nota' }).click();
  await expect(page).toHaveURL(/\/app\/notes\?n=/);
  const title = page.getByRole('textbox', { name: 'Sem título' });
  await expect(title).toBeVisible();
  await title.fill('Nota do telemóvel');
  // autosave (debounced), then the list shows it
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(page.locator('.kh-nt-card', { hasText: 'Nota do telemóvel' })).toBeVisible();
});

test('Notas: list → detail → back (button and browser Back)', async ({ page }) => {
  await login(page);
  await page.goto('app/notes');
  const card = page.locator('.kh-nt-card', { hasText: 'Nota do telemóvel' });
  await expect(card).toBeVisible();
  // a phone shows the list, no note is opened by itself
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(page.locator('.kh-nt-editor')).toBeHidden();

  await card.click();
  await expect(page).toHaveURL(/\/app\/notes\?n=/);
  await expect(page.getByRole('textbox', { name: 'Sem título' })).toHaveValue('Nota do telemóvel');
  await expect(card).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(card).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/\/app\/notes\?n=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/notes$/);
  await expect(card).toBeVisible();

  // the folders open in a sheet
  await page.getByRole('button', { name: /^Pastas:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Pastas' });
  await sheet.getByRole('button', { name: 'Favoritos' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pastas: Favoritos/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pastas:/ }).click();
  await page.getByRole('dialog', { name: 'Pastas' }).getByRole('button', { name: 'Todas as Notas' }).click();
});

test('Tarefas: list → detail → back', async ({ page }) => {
  await login(page);
  await tabs(page).getByRole('button', { name: 'Criar' }).click();
  await page.getByRole('dialog', { name: 'Criar' }).getByRole('button', { name: 'Nova tarefa' }).click();
  await expect(page).toHaveURL(/\/app\/tasks\?t=/);
  await expect(page.locator('.kh-tk-detail')).toBeVisible();

  await tabs(page).getByRole('link', { name: 'Tarefas' }).click();
  await expect(page).toHaveURL(/\/app\/tasks$/);
  const item = page.locator('.kh-tk-item').first();
  await expect(item).toBeVisible();
  await expect(page.locator('.kh-tk-detail')).toBeHidden();
  await item.click();
  await expect(page).toHaveURL(/\/app\/tasks\?t=/);
  await expect(page.locator('.kh-tk-detail')).toBeVisible();
  await expect(item).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/app\/tasks$/);
  await expect(item).toBeVisible();

  await item.click();
  await expect(page.locator('.kh-tk-detail')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/tasks$/);
  await expect(page.locator('.kh-tk-detail')).toBeHidden();
});

test('notifications open as a sheet and modals fill the screen', async ({ page }) => {
  await login(page);
  await page.getByTestId('notify-bell').click();
  const ntf = page.getByRole('dialog', { name: 'Notificações' });
  await expect(ntf).toBeVisible();
  const box = (await ntf.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(388);
  expect(box.y + box.height).toBeGreaterThan(840);
  await ntf.getByRole('button', { name: 'Fechar' }).click();
  await expect(ntf).toHaveCount(0);

  await page.getByRole('button', { name: 'Conta e Dados' }).click();
  const modal = page.getByRole('dialog', { name: 'Conta e Dados' });
  await expect(modal).toBeVisible();
  const m = (await modal.boundingBox())!;
  expect(Math.round(m.width)).toBe(390);
  expect(Math.round(m.height)).toBe(844);
});
