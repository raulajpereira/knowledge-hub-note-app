import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Atas de Reunião: minutes with participants, topics, checklists, a task from a to-do, Calendar, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `meetings-${Date.now()}@example.com`;
const password = 'Meetings-Strong-Pass-1';

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
  // its own address for the registration limit (10 an hour per IP)
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.141' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Meetings Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'meetings');
});

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('write minutes, a task from a to-do, on the Calendar, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/meetings');
  await expect(page.getByText('Ainda sem atas. Crie a primeira com +.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Nova Ata' }).click();
  await page.getByLabel('Tema da reunião').fill('Kick-off Atlas');
  await page.getByLabel('Data', { exact: true }).fill(isoToday());
  await page.getByLabel('Início', { exact: true }).fill('09:30');
  await page.getByLabel('Fim', { exact: true }).fill('10:30');

  // participants: free names (also outside the app), Enter or comma adds
  const who = page.getByLabel('Adicionar nome e Enter (podem ser externos)');
  await who.fill('Bia Santos');
  await who.press('Enter');
  await who.fill('Luís Costa (cliente), Pedro Almeida');
  await who.press('Enter');
  await expect(page.locator('.kh-mt-chip')).toHaveText([
    'Bia Santos',
    'Luís Costa (cliente)',
    'Pedro Almeida',
  ]);
  await page.getByRole('button', { name: 'Eliminar Pedro Almeida' }).click();

  await page.getByLabel('Temas discutidos').fill('Âmbito da fase 2 e calendário do go-live.');
  await page.getByRole('button', { name: '+ Ponto' }).click();
  await page.getByLabel('Pontos a rever 1').fill('Validar rubricas');
  await page.getByRole('button', { name: '+ Ação' }).click();
  await page.getByLabel('Coisas a fazer 1').fill('Preparar plano de testes');
  await page.getByLabel('Coisas a fazer 1').press('Enter');
  await page.getByLabel('Coisas a fazer 2').fill('Enviar ata ao cliente');
  await page.getByRole('button', { name: 'Feito: Enviar ata ao cliente' }).click();
  await expect(page.getByText('1/2')).toBeVisible();

  // a to-do becomes a task linked to the meeting
  await page
    .getByRole('button', { name: 'Criar tarefa ligada a esta reunião: Preparar plano de testes' })
    .click();
  await expect(page.getByText('Tarefa criada e ligada à reunião.')).toBeVisible();
  await expect(page.locator('.kh-cx__link', { hasText: 'Preparar plano de testes' })).toBeVisible();

  await page.waitForTimeout(800); // debounced saves
  await page.reload();
  await expect(page.locator('.kh-mt-item', { hasText: 'Kick-off Atlas' })).toContainText(
    '09:30–10:30 · 2 pessoas',
  );
  await expect(page.getByLabel('Temas discutidos')).toHaveValue('Âmbito da fase 2 e calendário do go-live.');
  await expect(page.getByLabel('Coisas a fazer 2')).toHaveValue('Enviar ata ao cliente');

  // on the Calendar, on its day, with the time
  await page.goto('app/calendar');
  await expect(page.locator('.kh-cal__item', { hasText: '09:30 Kick-off Atlas' }).first()).toBeVisible();
  await page.locator('.kh-cal__item', { hasText: '09:30 Kick-off Atlas' }).first().click();
  await expect(page).toHaveURL(/app\/meetings\?m=/);

  // delete → Trash
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-mt-item')).toHaveCount(0);
  await page.goto('app/trash');
  await expect(page.getByText('Kick-off Atlas')).toBeVisible();
});
