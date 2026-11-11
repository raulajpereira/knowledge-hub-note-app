import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Registo de Tempos: the header button starts / stops the timer, the page lists it, the Activity shows it, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `timelog-${Date.now()}@example.com`;
const password = 'Timelog-Strong-Pass-1';

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
  const page = await browser.newPage({
    locale: 'pt-PT',
    // own IP: the register limit (10/h per IP) is shared by every spec without one
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.214' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Timelog Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('start and stop from the header, the page, the Activity, Trash', async ({ page }) => {
  await login(page);
  // the date and time now live in the weather card
  await expect(page.locator('.kh-wxb__time')).toBeVisible();
  await page.getByRole('button', { name: 'Registar horas' }).click();
  const start = page.getByRole('dialog', { name: 'Registar horas' });
  await start.getByLabel('Ticket').fill('INC0099 · Interface stock');
  await start.getByLabel('Cliente').fill('Cliente Teste');
  await start.getByLabel('Descrição').fill('Mapeamento de campos');
  await start.getByRole('button', { name: /Iniciar/ }).click();
  await expect(start).toHaveCount(0);
  const run = page.locator('.kh-tl-btn[data-run]');
  await expect(run).toContainText('INC0099');
  await expect(run.locator('.kh-tl-btn__clk')).toHaveText(/^00:00:0\d$/);

  // reload: the timer keeps running (it lives on the server)
  await page.reload();
  await expect(page.locator('.kh-tl-btn[data-run]')).toBeVisible();

  await page.locator('.kh-tl-btn[data-run]').click();
  const stop = page.getByRole('dialog', { name: 'A registar' });
  await expect(stop).toContainText('guarda 0h 15m');
  await stop.getByLabel('Descrição').fill('Mapeamento de campos e validação');
  await stop.getByRole('button', { name: /Terminar e guardar/ }).click();
  await expect(page.getByText('Registo guardado · 0h 15m')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registar horas' })).toBeVisible();

  await page.getByRole('link', { name: /^Registo de Tempos/ }).click();
  await expect(page.getByRole('heading', { name: 'Registo de Tempos' })).toBeVisible();
  const row = page.locator('.kh-tl-cols.kh-table__row', { hasText: 'INC0099' });
  await expect(row).toContainText('0h 15m');
  await expect(row).toContainText('Mapeamento de campos e validação');

  // the Activity (header) shows it too
  await page.getByRole('button', { name: 'Atividade' }).click();
  await expect(page.getByRole('dialog', { name: 'Atividade' })).toContainText(
    'INC0099 · Interface stock · 0h 15m',
  );
  await page.keyboard.press('Escape');

  // edit → delete → Trash
  await row.click();
  const edit = page.getByRole('dialog', { name: 'Editar registo' });
  await edit.getByRole('button', { name: 'Apagar' }).click();
  await page
    .getByRole('dialog', { name: 'Apagar este registo?' })
    .getByRole('button', { name: 'Apagar' })
    .click();
  await expect(row).toHaveCount(0);
  await page.goto('app/trash');
  await expect(page.getByText(/INC0099 · Interface stock/)).toBeVisible();
});
