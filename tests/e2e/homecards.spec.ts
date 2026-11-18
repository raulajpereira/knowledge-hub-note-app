import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Início: the cards for the features added later can be added one by one in "Personalizar" and show their data.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `homecards-${Date.now()}@example.com`;
const password = 'Homecards-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.221' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Cards Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const shot = async (page: Page, name: string) => {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`) });
};

test('the new cards, one by one, with their data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // some data: a meeting today and a running timer
  await page.evaluate(
    async ([b, day]) => {
      const post = (p: string, body: unknown) =>
        fetch(`${b}/api/v1${p}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      await post('/meetings', {
        title: 'Daily SuccessFactors',
        heldOn: day,
        startTime: '09:30',
        endTime: '10:00',
      });
      await post('/timelog/start', { refLabel: 'INC0012345', clientLabel: 'Porto Logística' });
    },
    [base, today] as const,
  );
  await page.goto('app');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const added = [
    'Registo de Tempos',
    'Helpdesk',
    'Reuniões de hoje',
    'Nota do dia',
    'Notas SAP',
    'Cutover e Testes',
    'Ficheiros recentes',
  ];
  for (const name of added) await page.getByRole('button', { name: `+ ${name}`, exact: true }).click();
  // not in this plan (SAP): no chip for them
  await expect(page.getByRole('button', { name: '+ Notas de voz', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ SAP News', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir' }).click();
  for (const name of added)
    await expect(page.locator('.kh-card__title', { hasText: name }).first()).toBeVisible();
  const timer = page.locator('[data-type=timelog]');
  await expect(timer).toContainText('INC0012345');
  await expect(timer.getByRole('button', { name: /Terminar/ })).toBeVisible();
  await expect(page.locator('[data-type=meetings]')).toContainText('Daily SuccessFactors');
  await expect(page.locator('[data-type=daily]')).toContainText('Reuniões: 1');
  await expect(page.locator('[data-type=helpdesk]')).toContainText('Ainda sem tickets do helpdesk');
  await page.locator('[data-type=timelog]').scrollIntoViewIfNeeded();
  await shot(page, 'home-cards');
  await page.locator('[data-type=files]').scrollIntoViewIfNeeded();
  await shot(page, 'home-cards-2');
  // the card's button opens the header timer's dialog
  await timer.getByRole('button', { name: /Terminar/ }).click();
  await expect(page.getByRole('dialog', { name: 'A registar' })).toBeVisible();
});
