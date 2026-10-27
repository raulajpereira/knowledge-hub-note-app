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

const OPEN = /^Abrir a previsão completa de /;

test('weather banner → popup: now, warnings, hours, a day, details; keyboard', async ({ page }) => {
  await mockWeather(page);
  await login(page);
  const banner = page.getByTestId('weather');
  // the compact banner on Início
  await expect(banner.locator('.kh-wx__temp')).toHaveText('20°');
  await expect(banner.getByText('Pouco nublado')).toBeVisible();
  await expect(banner.getByText('3 avisos')).toBeVisible();
  await expect(banner.getByText('Previsão completa')).toBeVisible();
  await expect(banner.getByText('Próximas 48 horas')).toHaveCount(0);

  // keyboard: the banner is a button; Enter opens, Esc closes, focus comes back
  const open = banner.getByRole('button', { name: OPEN });
  await open.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Meteorologia' });
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.keyboard.press(' ');
  await expect(dlg).toBeVisible();

  const full = page.getByTestId('weather-full');
  await expect(full.getByText('Próximas 48 horas')).toBeVisible();
  await expect(full.getByText('Sensação 18°').first()).toBeVisible();
  await expect(full.getByText('Dados: MET Norway')).toBeVisible();
  await expect(full.getByText('Avisos: IPMA')).toBeVisible();

  // IPMA warnings: chips, then the panel with the details
  await expect(full.getByRole('button', { name: /Agitação marítima · Laranja/ })).toBeVisible();
  await full.getByRole('button', { name: '3 avisos' }).click();
  await expect(full.getByText('Avisos IPMA · Lisboa')).toBeVisible();
  await expect(full.getByText(/Ondas de sudoeste/)).toBeVisible();

  // an hour's details
  await full.getByRole('button', { name: /^16h, 20°/ }).click();
  await expect(full.locator('.kh-wx__hourinfo')).toContainText('Rajadas até');

  // a day: its hours take the place of the next 48 hours (wide popup)
  await full.getByRole('button', { name: /^Amanhã: Chuva/ }).click();
  await expect(full.getByText('Horas de Amanhã')).toBeVisible();
  await expect(full.getByRole('group', { name: 'Horas de Amanhã' })).toBeVisible();
  await full.getByRole('button', { name: 'Fechar o dia' }).click();
  await expect(full.getByText('Próximas 48 horas')).toBeVisible();

  // details tiles, kept hidden after a reload
  await expect(full.getByText('Índice UV')).toBeVisible();
  await full.getByRole('button', { name: 'Menos detalhes' }).click();
  await expect(full.getByText('Índice UV')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.reload();
  await banner.getByRole('button', { name: OPEN }).click();
  await expect(full.getByText('Próximas 48 horas')).toBeVisible();
  await expect(full.getByText('Índice UV')).toHaveCount(0);
  await full.getByRole('button', { name: 'Mais detalhes' }).click();
  await expect(full.getByText('Índice UV')).toBeVisible();
  await dlg.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dlg).toHaveCount(0);
});

test('weather: location picker from the banner and the popup, °F, kept after reload', async ({ page }) => {
  const asked = await mockWeather(page);
  await login(page);
  const banner = page.getByTestId('weather');
  await expect(banner.locator('.kh-wx__temp')).toHaveText('20°');
  await banner.locator('.kh-wx__place').click();
  const picker = page.getByRole('dialog', { name: 'Localização' });
  await picker.getByPlaceholder('Procurar cidade ou vila…').fill('Porto');
  await picker.getByRole('button', { name: 'Procurar', exact: true }).click();
  await picker.getByRole('button', { name: /Porto Santo/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Meteorologia' })).toHaveCount(0); // the chip doesn't open the popup
  await expect(banner.locator('.kh-wx__place')).toContainText('Porto Santo');
  await expect.poll(() => asked.at(-1)).toBe('33.0612,-16.3403');

  // inside the popup too
  await banner.getByRole('button', { name: OPEN }).click();
  const full = page.getByTestId('weather-full');
  await full.locator('.kh-wx__place').click();
  await expect(picker.getByText('Recentes')).toBeVisible();
  await picker.getByRole('radio', { name: '°F' }).click();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(full.locator('.kh-wx__temp')).toHaveText('68°');
  await page.keyboard.press('Escape');
  await expect(banner.locator('.kh-wx__temp')).toHaveText('68°');

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(banner.locator('.kh-wx__place')).toContainText('Porto Santo');
  await expect(banner.locator('.kh-wx__temp')).toHaveText('68°');
  // back to Lisboa / °C for the other tests
  await banner.locator('.kh-wx__place').click();
  await picker.getByRole('radio', { name: '°C' }).click();
  await picker.getByRole('button', { name: /Lisboa/ }).click();
  await expect(banner.locator('.kh-wx__place')).toContainText('Lisboa');
});

test('weather: error and retry on the banner; phone sheet opens a day inline', async ({ browser }) => {
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
  const banner = page.getByTestId('weather');
  await expect(banner.getByRole('alert')).toContainText('Não foi possível obter a meteorologia.');
  await page.unroute(/\/api\/v1\/weather\?/);
  await mockWeather(page);
  await banner.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(banner.locator('.kh-wx__temp')).toHaveText('20°');

  // phone: a full-height sheet; one warnings chip for all; the day opens inside the list
  await banner.getByRole('button', { name: OPEN }).tap();
  const sheet = page.getByRole('dialog', { name: 'Meteorologia' });
  await expect(sheet).toHaveClass(/kh-sheet-panel/);
  const box = (await sheet.boundingBox())!;
  expect(box.height).toBeGreaterThan(780);
  const full = page.getByTestId('weather-full');
  await expect(full.getByRole('button', { name: /Agitação marítima/ })).toBeHidden();
  await expect(full.getByRole('button', { name: '3 avisos' })).toBeVisible();
  await full.getByRole('button', { name: /^Amanhã: Chuva/ }).click();
  await expect(full.getByRole('region', { name: 'Horas de Amanhã' })).toBeVisible();
  await expect(full.getByText('Próximas 48 horas')).toBeVisible();
  await ctx.close();
});
