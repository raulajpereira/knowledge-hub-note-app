import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Fase 11.1: security headers (CSP with a nonce, no framing) and deleting
// one's own account from Conta e Dados.
test.use({
  locale: 'pt-PT',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.130' },
});

const outbox = process.env.MAIL_OUTBOX_DIR;
const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

test('pages send a nonce CSP and refuse framing; the API is not framable either', async ({
  page,
  request,
}) => {
  const res = await page.goto('login');
  const csp = res!.headers()['content-security-policy']!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(res!.headers()['x-frame-options']).toBe('DENY');
  expect(res!.headers()['strict-transport-security']).toContain('max-age=');
  // every Next script carries the nonce of this response
  const nonce = /'nonce-([^']+)'/.exec(csp)![1];
  const scripts = await page
    .locator('script')
    .evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => n === nonce)).toBe(true);
  // a different nonce on the next response
  const again = (await request.get('login')).headers()['content-security-policy']!;
  expect(again).not.toContain(nonce);
  const api = await request.get('api/health');
  expect(api.headers()['x-frame-options']).toBe('DENY');
});

test('Conta e Dados › Eliminar conta deletes the account', async ({ page }) => {
  test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');
  const email = `gone-${Date.now()}@example.com`;
  const password = 'Gone-Strong-Pass-1';
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  await page.goto('register');
  await page.getByLabel('Nome').fill('Gone Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  let link = '';
  for (let i = 0; i < 40 && !link; i++) {
    const f = fs.readdirSync(outbox!).filter((x) => x.includes('-verify-') && x.includes(safe));
    if (f.length) {
      const u = new URL(
        /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(
          (JSON.parse(fs.readFileSync(path.join(outbox!, f[0]!), 'utf8')) as { text: string }).text,
        )![0],
      );
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      link = u.pathname.replace(new RegExp(`^${base}/`), '').replace(/^\//, '') + u.search;
    } else await new Promise((r) => setTimeout(r, 250));
  }
  await page.goto(link);
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);

  await page.getByTitle('Conta e Dados').click();
  const dlg = page.getByRole('dialog', { name: 'Conta e Dados' });
  await dlg.getByRole('button', { name: 'Eliminar conta' }).click();
  await page
    .getByRole('dialog', { name: 'Eliminar a sua conta?' })
    .getByRole('button', { name: 'Eliminar conta' })
    .click();
  await page.waitForURL(/\/login/);
  // the account is gone
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Email ou password incorretos.')).toBeVisible();
});
