import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Início › weather card with mocked data: /api/v1/weather* answered in the
// browser from tests/fixtures/weather (built from MET Norway + IPMA samples,
// "now" = 27 Oct 13:20 in Lisbon) — no provider is called.
test.use({
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
  viewport: { width: 1440, height: 1100 },
  serviceWorkers: 'block',
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `weather-${Date.now()}@example.com`;
const password = 'Weather-Strong-Pass-1';
const IP = { 'x-forwarded-for': '198.51.100.192' };
const WX = fs.readFileSync(path.join('tests', 'fixtures', 'weather', 'api-lisboa.json'), 'utf8');
const PLACES = {
  places: [
    { lat: 41.1495, lon: -8.6108, city: 'Porto', region: 'Norte, Portugal' },
    { lat: 33.0612, lon: -16.3403, city: 'Porto Santo', region: 'Madeira, Portugal' },
  ],
};

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

test.beforeAll(async ({ browser }) => {
  const out = execFileSync(
    'npx',
    ['tsx', 'src/cli/index.ts', 'codes:create', '--type', 'license', '--plan', 'PRO'],
    { encoding: 'utf8' },
  );
  const code = /KH-LIC-\d{6}/.exec(out)![0];
  const page = await browser.newPage({ locale: 'pt-PT', extraHTTPHeaders: IP });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Wx Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

/** Mocks the weather API; returns the coordinates the card asked for. */
async function mockWeather(page: Page, status = 200) {
  const asked: string[] = [];
  await page.route(/\/api\/v1\/weather\?/, (r) => {
    const u = new URL(r.request().url());
    asked.push(`${u.searchParams.get('lat')},${u.searchParams.get('lon')}`);
    return status === 200
      ? r.fulfill({ status, contentType: 'application/json', body: WX })
      : r.fulfill({
          status,
          contentType: 'application/json',
          body: '{"error":{"code":"weather_unavailable"}}',
        });
  });
  await page.route(/\/api\/v1\/weather\/geocode\?/, (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(PLACES) }),
  );
  return asked;
}

async function login(page: Page) {
  await page.setExtraHTTPHeaders(IP);
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);
}

test('weather card: now, warnings, hours, a day, details', async ({ page }) => {
  await mockWeather(page);
  await login(page);
  const card = page.getByTestId('weather');
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();
  await expect(card.locator('.kh-wx__temp')).toHaveText('20°');
  await expect(card.getByText('Pouco nublado').first()).toBeVisible();
  await expect(card.getByText('Sensação 18°').first()).toBeVisible();
  await expect(card.getByText('Dados: MET Norway')).toBeVisible();
  await expect(card.getByText('Avisos: IPMA')).toBeVisible();

  // IPMA warnings: chips, then the panel with the details
  await expect(card.getByRole('button', { name: /Agitação marítima · Laranja/ })).toBeVisible();
  await card.getByRole('button', { name: '3 avisos' }).click();
  await expect(card.getByText('Avisos IPMA · Lisboa')).toBeVisible();
  await expect(card.getByText(/Ondas de sudoeste/)).toBeVisible();

  // an hour's details
  await card.getByRole('button', { name: /^16h, 20°/ }).click();
  await expect(card.locator('.kh-wx__hourinfo')).toContainText('Rajadas até');

  // a day: its hours take the place of the next 48 hours (wide card)
  await card.getByRole('button', { name: /^Amanhã: Chuva/ }).click();
  await expect(card.getByText('Horas de Amanhã')).toBeVisible();
  await expect(card.getByRole('group', { name: 'Horas de Amanhã' })).toBeVisible();
  await card.getByRole('button', { name: 'Fechar o dia' }).click();
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();

  // details tiles, kept hidden after a reload
  await expect(card.getByText('Índice UV')).toBeVisible();
  await card.getByRole('button', { name: 'Menos detalhes' }).click();
  await expect(card.getByText('Índice UV')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();
  await expect(card.getByText('Índice UV')).toHaveCount(0);
  await card.getByRole('button', { name: 'Mais detalhes' }).click();
  await expect(card.getByText('Índice UV')).toBeVisible();
});

test('weather card: location picker, °F, kept after reload', async ({ page }) => {
  const asked = await mockWeather(page);
  await login(page);
  const card = page.getByTestId('weather');
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();
  await card
    .getByRole('button', { name: /Lisboa/ })
    .first()
    .click();
  const dlg = page.getByRole('dialog', { name: 'Localização' });
  await dlg.getByPlaceholder('Procurar cidade ou vila…').fill('Porto');
  await dlg.getByRole('button', { name: 'Procurar', exact: true }).click();
  await dlg.getByRole('button', { name: /Porto Santo/ }).click();
  await expect(dlg).toHaveCount(0);
  await expect(card.locator('.kh-wx__place')).toContainText('Porto Santo');
  await expect.poll(() => asked.at(-1)).toBe('33.0612,-16.3403');

  await card.locator('.kh-wx__place').click();
  await expect(dlg.getByText('Recentes')).toBeVisible();
  await dlg.getByRole('radio', { name: '°F' }).click();
  await page.keyboard.press('Escape');
  await expect(card.locator('.kh-wx__temp')).toHaveText('68°');

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(card.locator('.kh-wx__place')).toContainText('Porto Santo');
  await expect(card.locator('.kh-wx__temp')).toHaveText('68°');
  // back to Lisboa / °C for the other tests
  await card.locator('.kh-wx__place').click();
  await dlg.getByRole('radio', { name: '°C' }).click();
  await dlg.getByRole('button', { name: /Lisboa/ }).click();
  await expect(card.locator('.kh-wx__place')).toContainText('Lisboa');
});

test('weather card: error state, retry; phone layout opens a day inline', async ({ browser }) => {
  const ctx = await browser.newContext({
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await mockWeather(page, 502);
  await login(page);
  const card = page.getByTestId('weather');
  await expect(card.getByRole('alert')).toContainText('Não foi possível obter a meteorologia.');
  await page.unroute(/\/api\/v1\/weather\?/);
  await mockWeather(page);
  await card.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();

  // phone: one warnings chip for all, the day opens inside the list
  await expect(card.getByRole('button', { name: /Agitação marítima/ })).toBeHidden();
  await expect(card.getByRole('button', { name: '3 avisos' })).toBeVisible();
  await card.getByRole('button', { name: /^Amanhã: Chuva/ }).click();
  await expect(card.getByRole('region', { name: 'Horas de Amanhã' })).toBeVisible();
  await expect(card.getByText('Próximas 48 horas')).toBeVisible();
  await ctx.close();
});
