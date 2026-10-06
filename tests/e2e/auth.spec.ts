import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Critical auth flows (ROADMAP Fase 1 CA): registration with a code, email
// confirmation, login, password recovery, lockout. Emails are read from
// MAIL_OUTBOX_DIR (see playwright.config.ts).
test.use({ locale: 'pt-PT' });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

function newCode(args: string[]): string {
  const out = execFileSync('npx', ['tsx', 'src/cli/index.ts', 'codes:create', ...args], { encoding: 'utf8' });
  return /KH-(LIC|INV)-\d{6}/.exec(out)![0];
}

async function linkFor(kind: string, email: string): Promise<string> {
  const safe = email.replace(/[^a-z0-9@.]/gi, '_');
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(outbox!)
      ? fs
          .readdirSync(outbox!)
          .filter((f) => f.includes(`-${kind}-`) && f.includes(safe))
          .sort()
      : [];
    if (files.length) {
      const msg = JSON.parse(fs.readFileSync(path.join(outbox!, files.at(-1)!), 'utf8')) as { text: string };
      const url = new URL(/https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.text)![0]);
      // Relative to the test baseURL (which already includes the base path).
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      return url.pathname.replace(new RegExp(`^${base}/`), '').replace(/^\//, '') + url.search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} email for ${email}`);
}

const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;
const password = 'E2e-Strong-Pass-1';

async function login(page: Page, pw: string) {
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('register with a license code, confirm the email, sign in and out', async ({ page }) => {
  const code = newCode(['--type', 'license', '--plan', 'PRO', '--seats', '2', '--client', 'E2E Lda']);
  await page.goto('register');
  await page.getByLabel('Nome').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await expect(page.getByText('Muito forte')).toBeVisible();
  await page.getByLabel('Licença').fill('KH-LIC-000000');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Código inválido')).toBeVisible();
  await page.getByLabel('Licença').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();

  // Not confirmed yet → login is refused with a hint.
  await login(page, password);
  await expect(page.getByText('Confirme primeiro o seu email')).toBeVisible();

  await page.goto(await linkFor('verify', email));
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();

  await login(page, password);
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /^(Bom dia|Boa tarde|Boa noite), E2E$/ })).toBeVisible();
  const account = page.getByTitle('Conta e Dados');
  await expect(account).toContainText('PRO');

  await account.click();
  await page.getByRole('button', { name: 'Terminar Sessão' }).click();
  await page
    .getByRole('dialog', { name: undefined })
    .last()
    .getByRole('button', { name: 'Terminar Sessão' })
    .click();
  await page.waitForURL(/\/login$/);
  await page.goto('app');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('password recovery: link, new password, old one stops working, link single-use', async ({ page }) => {
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByText('Esqueceu-se da password?').click();
  await expect(page.getByText('Enviámos instruções')).toBeVisible();

  const link = await linkFor('reset', email);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Definir nova password' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel('Nova password').fill('Brand-New-Pass-2');
  await page.getByLabel('Confirmar password').fill('mismatch');
  await page.getByRole('button', { name: 'Guardar nova password' }).click();
  await expect(page.getByText('As passwords não coincidem.')).toBeVisible();
  await page.getByLabel('Confirmar password').fill('Brand-New-Pass-2');
  await page.getByRole('button', { name: 'Guardar nova password' }).click();
  await expect(page.getByRole('heading', { name: 'Password alterada' })).toBeVisible();

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Link inválido ou expirado' })).toBeVisible();

  await login(page, password);
  await expect(page.getByText('Email ou password incorretos.')).toBeVisible();
  await login(page, 'Brand-New-Pass-2');
  await page.waitForURL(/\/app$/);
});

test('five wrong passwords lock the form for 30 seconds', async ({ page }) => {
  await page.goto('login');
  await page.getByLabel('Email').fill(`nobody-${stamp}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Email ou password incorretos.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/Demasiadas tentativas\. Tente de novo dentro de 30s\./)).toBeVisible();
});

test('pages switch to English', async ({ page }) => {
  await page.goto('login');
  await page.getByRole('radio', { name: 'EN' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await page.getByRole('radio', { name: 'PT' }).click();
});
