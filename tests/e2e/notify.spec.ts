import { expect, test, type Browser, type Page } from '@playwright/test';
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

async function verifyLink(who = email): Promise<string> {
  const safe = who.replace(/[^a-z0-9@.]/gi, '_');
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

async function login(page: Page, who = email) {
  await page.goto('login');
  await page.getByLabel('Email').fill(who);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);
}

async function newTask(page: Page, title: string) {
  const r = await page.request.post('api/v1/tasks', { data: { title, dueOn: today() } });
  expect(r.status()).toBe(201);
}

async function register(browser: Browser, who: string, name: string) {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('Email').fill(who);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink(who));
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
}

test.beforeAll(async ({ browser }) => {
  await register(browser, email, 'Bell Tester');
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
  // ?tab=… in the URL is read once: the page settles instead of re-rendering forever
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const busy = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value;
  const before = await busy();
  await page.waitForTimeout(2000);
  expect((await busy()) - before).toBeLessThan(0.8);

  // "Lembrar-me" in the task detail
  await page.goto('app/tasks');
  await page.getByText('Rever proposta').click();
  // the detail switches once the URL points at the task
  await expect(page.locator('.kh-tk-title')).toHaveValue('Rever proposta');
  const rem = page.getByTestId('task-remind');
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      /\/tasks\//.test(r.url()) &&
      (r.request().postData() ?? '').includes('day_before'),
  );
  await rem.selectOption('day_before');
  await saved;
  await page.reload();
  await expect(page.getByTestId('task-remind')).toHaveValue('day_before');
  await page.getByTestId('task-remind').selectOption('custom');
  await expect(page.getByLabel('Lembrete em')).toBeVisible();
});

// "Email para a app" shows only when the server has the inbound mailbox
// (INBOUND_* set on the server under test, e.g. INBOUND_ADDRESS=kh.entrada@gmail.com).
test('Email para a app: own code with live availability, address preview, old code reserved', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000); // two people (one registered here)
  await login(page);
  // the address base comes from the server (INBOUND_ADDRESS); null = not configured
  const cfg = (await page.request.get('api/v1/notifications/settings').then((r) => r.json())) as {
    settings: { inbound: { base: string } | null };
  };
  test.skip(!cfg.settings.inbound, 'inbound mailbox not configured on the server');
  const [local, domain] = cfg.settings.inbound!.base.split('@') as [string, string];
  await page.goto('app/settings?tab=notify');
  const card = page.getByTestId('inbound-card');
  await expect(card).toBeVisible();
  const input = card.getByTestId('inbound-code');
  const state = card.getByTestId('inbound-code-state');
  const save = card.locator('.kh-nf__codeline').getByRole('button', { name: 'Guardar' });
  const addr = (c: string) => `${local}+${c}@${domain}`;

  await input.fill('ab');
  await expect(state).toHaveText('Formato inválido');
  await expect(save).toBeDisabled();
  await input.fill('no-reply');
  await expect(state).toHaveText('Palavra reservada, escolha outra');
  const mine = `e2e${Date.now().toString(36)}`;
  await input.fill(`${mine.toUpperCase()}`); // typed in capitals: lower case
  await expect(input).toHaveValue(mine);
  await expect(state).toHaveText('Disponível');
  await expect(card.getByTestId('inbound-preview')).toHaveText(`Novo endereço: ${addr(mine)}`);
  // first code: nothing to lose, no question
  await save.click();
  await expect(card.getByTestId('inbound-address')).toHaveText(addr(mine));
  await expect(state).toHaveText('É o seu endereço atual');
  await expect(card.getByTestId('inbound-preview')).toHaveCount(0);

  // a second change asks first and keeps the old one reserved
  await input.fill(`${mine}.b`);
  await expect(state).toHaveText('Disponível');
  await save.click();
  const dlg = page.getByRole('dialog', { name: 'Mudar o endereço?' });
  await expect(dlg).toContainText('fica reservado para si durante 30 dias');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(card.getByTestId('inbound-address')).toHaveText(addr(`${mine}.b`));
  const resv = card.getByTestId('inbound-reserved');
  await expect(resv).toContainText(addr(mine));
  await expect(resv).toContainText('reservado até');
  await expect(resv.getByRole('button', { name: 'Voltar a este' })).toBeVisible();
  // PRO has no Emails module: no "Email" target
  await expect(card.getByRole('button', { name: 'Email', exact: true })).toHaveCount(0);

  // someone else: the reserved one and the current one are taken, a new one is free
  const other = `bell2-${Date.now()}@example.com`;
  await register(browser, other, 'Outra Pessoa');
  const ctx = await browser.newContext({
    locale: 'pt-PT',
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.162' },
  });
  const p2 = await ctx.newPage();
  await login(p2, other);
  await p2.goto('app/settings?tab=notify');
  const c2 = p2.getByTestId('inbound-card');
  await c2.getByTestId('inbound-code').fill(mine);
  await expect(c2.getByTestId('inbound-code-state')).toHaveText('Já está em uso');
  await c2.getByTestId('inbound-code').fill(`${mine}.b`);
  await expect(c2.getByTestId('inbound-code-state')).toHaveText('Já está em uso');
  await expect(c2.locator('.kh-nf__codeline').getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await c2.getByTestId('inbound-code').fill(`${mine}-c`);
  await expect(c2.getByTestId('inbound-code-state')).toHaveText('Disponível');
  await ctx.close();

  // back to the old one
  await resv.getByRole('button', { name: 'Voltar a este' }).click();
  await page
    .getByRole('dialog', { name: 'Voltar a este endereço?' })
    .getByRole('button', { name: 'Voltar a este' })
    .click();
  await expect(card.getByTestId('inbound-address')).toHaveText(addr(mine));
  await expect(resv).toContainText(addr(`${mine}.b`));

  // the check is rate-limited (30 a minute) and only says available / taken / invalid / reserved
  const r = await page.request.get(`api/v1/notifications/inbound/code?code=${mine}`);
  expect(await r.json()).toEqual({ status: 'available' });
  let last = 200;
  for (let i = 0; i < 32 && last !== 429; i++)
    last = (await page.request.get(`api/v1/notifications/inbound/code?code=x${i}abc`)).status();
  expect(last).toBe(429);
});
