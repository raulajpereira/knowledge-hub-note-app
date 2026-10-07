import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';
import { SAP_NEWS_FIXTURE, sapNewsKey } from '../fixtures/sapnews';

// Phase 7.5 SAP News: cards from the feeds (seeded into the server's feed cache,
// nothing is fetched from the internet), reader, saved for later, sources.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `news-${Date.now()}@example.com`;
const password = 'News-Strong-Pass-1';

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
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  for (const [url, items] of Object.entries(SAP_NEWS_FIXTURE))
    await redis.set(sapNewsKey(url), JSON.stringify(items), 'EX', 3600);
  redis.disconnect();
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'ULTRA'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.91' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('News Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('SAP News: cards, filter, reader, saved for later with the header badge, sources', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'SAP News' }).click();
  await expect(page.getByRole('heading', { name: 'SAP News' })).toBeVisible();
  const cards = page.locator('.kh-nw-card');
  await expect(cards).toHaveCount(7);
  await expect(page.getByText('3 fontes')).toBeVisible();

  // filter by source and search
  await page.getByRole('button', { name: /^ERP Today/ }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: /^Todas/ }).click();
  await page.getByLabel('Pesquisar notícias…').fill('abap cloud');
  await expect(cards).toHaveCount(1);
  await page.getByLabel('Pesquisar notícias…').fill('');

  // reader: sanitised article, save from inside
  await cards
    .filter({ hasText: 'Novidades do SAP S/4HANA Cloud' })
    .getByRole('button', { name: 'Ler' })
    .click();
  const reader = page.getByRole('dialog', { name: /Novidades do SAP S\/4HANA Cloud/ });
  await expect(reader.getByRole('heading', { name: 'O que muda' })).toBeVisible();
  await expect(reader.getByRole('link', { name: 'Ver original ↗' })).toHaveAttribute(
    'href',
    /example\.com\/sap-news\/1/,
  );
  await reader.getByRole('button', { name: 'Guardar' }).click();
  await expect(reader.getByRole('button', { name: 'Guardada' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reader).toBeHidden();
  await expect(page.locator('.kh-hdr__badge')).toHaveText('1');

  // saved list survives a reload; "Marcar como lida" removes it
  await page.reload();
  await page.getByRole('button', { name: /Guardadas/ }).click();
  const saved = page.getByRole('dialog', { name: 'Guardadas para mais tarde' });
  await expect(saved).toContainText('Novidades do SAP S/4HANA Cloud');
  await saved.getByRole('button', { name: 'Marcar como lida' }).click();
  await expect(saved).toContainText('Não tem notícias guardadas.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.kh-hdr__badge')).toHaveCount(0);

  // sources: turning one off hides its cards and chip
  await page.getByRole('button', { name: 'Fontes' }).click();
  await page.getByRole('switch', { name: /ERP Today/ }).click();
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(5);
  await expect(page.getByText('2 fontes')).toBeVisible();
});
