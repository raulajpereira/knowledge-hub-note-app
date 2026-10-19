import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Header bell: a task due today → the notification job → counter on the bell,
// popup, open the task (marks it read), "Marcar todas como lidas"; and the
// Notificações tab in Definições.
// its own address for the registration limit (10 an hour per IP)
test.use({
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.162' },
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `bell-${Date.now()}@example.com`;
const password = 'Bell-Strong-Pass-1';

const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });
// the notification job once, for this person only (its modules are server-only: react-server condition)
const notifyRun = () =>
  execFileSync(
    'npx',
    ['tsx', '--conditions=react-server', 'src/cli/index.ts', 'notify:run', '--email', email],
    {
      encoding: 'utf8',
    },
  );
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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

async function newTask(page: Page, title: string) {
  const r = await page.request.post('api/v1/tasks', { data: { title, dueOn: today() } });
  expect(r.status()).toBe(201);
}

test.beforeAll(async ({ browser }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Bell Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('bell: counter, popup, open marks read, mark all as read', async ({ page }) => {
  await login(page);
  const bell = page.getByTestId('notify-bell');
  await expect(bell).toBeVisible();
  await expect(page.getByTestId('notify-count')).toHaveCount(0);

  // empty popup
  await bell.click();
  const pop = page.getByRole('dialog', { name: 'Notificações' });
  await expect(pop.getByText('Sem notificações')).toBeVisible();
  await page.keyboard.press('Escape');

  await newTask(page, 'Enviar relatório SM37');
  notifyRun();
  await page.reload();
  await expect(page.getByTestId('notify-count')).toHaveText('1');

  await bell.click();
  await expect(pop.getByText('Tarefa para hoje')).toBeVisible();
  await pop.getByRole('listitem').filter({ hasText: 'Enviar relatório SM37' }).click();
  await page.waitForURL(/\/app\/tasks\?t=/);
  await expect(page.locator('.kh-tk-title')).toHaveValue('Enviar relatório SM37');
  await expect(page.getByTestId('notify-count')).toHaveCount(0);

  // two more → "9+" logic aside, the count; then mark all
  await newTask(page, 'Rever proposta');
  await newTask(page, 'Ligar ao cliente');
  notifyRun();
  await page.reload();
  await expect(page.getByTestId('notify-count')).toHaveText('2');
  await bell.click();
  await expect(pop.getByRole('listitem')).toHaveCount(3);
  await pop.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(page.getByTestId('notify-count')).toHaveCount(0);
  await expect(pop.locator('.kh-ntf__dot')).toHaveCount(0);

  // the job again: nothing new (one per task per day)
  notifyRun();
  await page.reload();
  await expect(bell).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('notify-count')).toHaveCount(0);
});

test('Definições › Notificações and the task reminder', async ({ page }) => {
  await login(page);
  await page.getByTestId('notify-bell').click();
  await page.getByRole('link', { name: 'Definições de notificações' }).click();
  await page.waitForURL(/\/app\/settings/);
  await expect(page.getByRole('tab', { name: 'Notificações' })).toHaveAttribute('aria-selected', 'true');
  const sw = page.getByRole('switch', { name: 'Resumo diário por email' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Resumo diário por email' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('Europe/Lisbon')).toBeVisible();

  // "Lembrar-me" in the task detail
  await page.goto('app/tasks');
  await page.getByText('Rever proposta').click();
  const rem = page.getByTestId('task-remind');
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/tasks\//.test(r.url()));
  await rem.selectOption('day_before');
  await saved;
  await page.reload();
  await expect(page.getByTestId('task-remind')).toHaveValue('day_before');
  await page.getByTestId('task-remind').selectOption('custom');
  await expect(page.getByLabel('Lembrete em')).toBeVisible();
});
