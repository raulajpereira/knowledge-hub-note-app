import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 5.1 Palavras-passe: zero-knowledge vault (setup, recovery key,
// encrypted items, lock / unlock, recovery with the key).
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `vault-${Date.now()}@example.com`;
const password = 'Vault-Strong-Pass-1';
const master = 'Cofre-Mestre-2026!';
let recoveryKey = '';

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
  // own (documentation) address: registration is limited to 10 per hour and IP,
  // and a retried spec elsewhere must not use up this one's
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.83' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Vault Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('Palavras-passe is an add-on: placeholder until the tenant has it', async ({ page }) => {
  await login(page);
  await page.goto('app/passwords');
  await expect(page.getByText('Proteja o Seu Cofre')).toHaveCount(0);
  cli('tenants:module', '--email', email, '--add', 'passwords');
  await page.reload();
  await expect(page.getByText('Proteja o Seu Cofre')).toBeVisible();
});

test('setup → recovery key → encrypted entry → lock / unlock', async ({ page }) => {
  await login(page);
  await page.goto('app/passwords');
  await page.getByLabel('Password do Cofre').fill('curta');
  await page.getByRole('button', { name: 'Criar e Desbloquear' }).click();
  await expect(page.locator('.kh-pw-lock__err')).toBeVisible();
  await page.getByLabel('Password do Cofre').fill(master);
  await page.getByLabel('Confirmar Password').fill(master);
  await page.getByRole('button', { name: 'Criar e Desbloquear' }).click();

  // the recovery key must be acknowledged before going on
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Guarde a sua chave de recuperação')).toBeVisible({ timeout: 20_000 });
  recoveryKey = (await dialog.locator('.kh-vk__key .kh-mono').textContent())!.trim();
  expect(recoveryKey).toMatch(/^KHRK(-[A-Z2-9]{1,4}){13}$/);
  await expect(dialog.getByRole('button', { name: 'Concluir' })).toBeDisabled();
  await dialog.getByRole('button', { name: /Guardei a chave/ }).click();
  await dialog.getByRole('button', { name: 'Concluir' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Nova Password' }).click();
  const panel = page.locator('.kh-pw-panel');
  await panel.getByLabel('Nome').fill('SAP PRD 100');
  await panel.getByLabel('Utilizador').fill('RPEREIRA');
  await panel.getByLabel('Password', { exact: true }).fill('Sup3r-Secret-Value!');
  await page.waitForTimeout(1200); // debounced encrypted save
  await expect(page.locator('.kh-pw-tr')).toContainText('SAP PRD 100');

  // the server only has ciphertext
  const raw = await page.evaluate(async () => {
    const r = await fetch(`${location.pathname.replace(/\/app\/.*$/, '')}/api/v1/vault`);
    return r.text();
  });
  expect(raw).not.toContain('SAP PRD 100');
  expect(raw).not.toContain('Sup3r-Secret-Value!');

  await page.getByRole('button', { name: 'Bloquear Cofre' }).click();
  await expect(page.getByText('Cofre Bloqueado')).toBeVisible();
  await page.getByLabel('Password do Cofre').fill('errada-123');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByText('Password incorreta. Tente novamente.')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Password do Cofre').fill(master);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.locator('.kh-pw-tr')).toContainText('SAP PRD 100', { timeout: 20_000 });
  await expect(page.locator('.kh-pw-tr')).toContainText('RPEREIRA');
});

test('forgotten master password: recover with the recovery key', async ({ page }) => {
  await login(page);
  await page.goto('app/passwords');
  await expect(page.getByText('Cofre Bloqueado')).toBeVisible();
  await page.getByRole('button', { name: 'Esqueceu-se da password do cofre?' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Chave de recuperação').fill(`a minha chave: ${recoveryKey.toLowerCase()}`);
  await dialog.getByLabel('Nova palavra-passe mestra').fill('Nova-Mestra-2026!');
  await dialog.getByLabel('Confirmar palavra-passe').fill('Nova-Mestra-2026!');
  await dialog.getByRole('button', { name: 'Recuperar cofre' }).click();
  await expect(page.locator('.kh-pw-tr')).toContainText('SAP PRD 100', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Bloquear Cofre' }).click();
  await page.getByLabel('Password do Cofre').fill('Nova-Mestra-2026!');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.locator('.kh-pw-tr')).toContainText('SAP PRD 100', { timeout: 20_000 });
});
