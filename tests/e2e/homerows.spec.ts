import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Início in rows: a card dragged next to a card of a row of 2 makes it a row of 3 equal
// cards; dragged below the last row it gets a row of its own; kept after reload (user_prefs).
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 2600 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `homerows-${Date.now()}@example.com`;
const password = 'Rows-Strong-Pass-1';

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
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Rows Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

async function login(page: Page) {
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);
}

const rowTypes = (page: Page) =>
  page
    .locator('[data-hrow]')
    .evaluateAll((rows) =>
      rows.map((r) => Array.from(r.querySelectorAll('[data-hw]')).map((c) => c.getAttribute('data-type'))),
    );

/** Drags `card` by its ⠿ handle to the point `to` gives (measured once the drag started). */
async function dragTo(page: Page, card: Locator, to: () => Promise<[number, number]>) {
  const h = (await card.locator('.kh-card__handle').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  const [x, y] = await to();
  await page.mouse.move(x, y, { steps: 12 });
}

test('a card dragged into a row of 2 splits it in 3; below the last row it makes a new row', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByTestId('weather')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Personalizar' }).click();
  const before = await rowTypes(page);
  expect(before[0]).toEqual(['today', 'capture']);
  const src = before.at(-1)!.at(-1)!; // last card of the last row
  const srcCard = page.locator(`[data-hw][data-type="${src}"]`);

  // next to "capture" (right half, mid-height) → row 1 gets a vertical bar, then 3 cards
  await dragTo(page, srcCard, async () => {
    const cap = (await page.locator('[data-hw][data-type="capture"]').boundingBox())!;
    return [cap.x + cap.width * 0.8, cap.y + cap.height / 2];
  });
  await expect(page.getByTestId('card-drop')).toBeVisible();
  await page.mouse.up();
  const row0 = page.locator('[data-hrow="0"]');
  await expect(row0).toHaveAttribute('data-n', '3');
  expect((await rowTypes(page))[0]).toEqual(['today', 'capture', src]);
  const widths = await row0
    .locator('[data-hw]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);

  // "today" below the last row → horizontal bar, then a row of its own at the end
  const rows = page.locator('[data-hrow]');
  await dragTo(page, page.locator('[data-hw][data-type="today"]'), async () => {
    const last = (await rows.last().boundingBox())!;
    return [last.x + last.width / 2, last.y + last.height + 8];
  });
  await expect(page.getByTestId('row-drop')).toBeVisible();
  await page.mouse.up();
  const after = await rowTypes(page);
  expect(after[0]).toEqual(['capture', src]);
  expect(after.at(-1)).toEqual(['today']);

  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator('[data-hrow="0"]')).toHaveAttribute('data-n', '2');
  expect(await rowTypes(page)).toEqual(after);
});
