import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Fase 10 Admin Console: 2FA gate, Visão Geral, Códigos (generate, detail,
// pause), Auditoria with the CSV export, packs, and a plan request from the
// app's plans window approved in Pedidos.
// its own client IP: sign-ups are limited per IP (10/h) and the suite registers many people
test.use({
  locale: 'pt-PT',
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.120' },
});
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `console-${Date.now()}@example.com`;
let secret = '';
const password = 'Console-Strong-Pass-1';
const cli = (...args: string[]) =>
  execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], { encoding: 'utf8' });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string) {
  let bits = 0;
  let v = 0;
  const key: number[] = [];
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    v = (v << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      key.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(key)).update(c).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

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

test('console: 2FA gate, overview, generate and pause a code, audit and CSV', async ({ page }) => {
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'PRO'))![0];
  await page.goto('register');
  await page.getByLabel('Nome').fill('Console Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  cli('admins:grant', '--email', email, '--role', 'admin');

  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);

  // without 2FA the console asks for it
  await page.goto('admin');
  await expect(page.getByRole('heading', { name: 'Ative a autenticação de dois fatores' })).toBeVisible();
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const setup = (await (await page.request.post(`${base}/api/v1/auth/2fa/setup`, { data: {} })).json()) as {
    secret: string;
  };
  secret = setup.secret;
  expect(
    (await page.request.post(`${base}/api/v1/auth/2fa/enable`, { data: { code: totp(setup.secret) } })).ok(),
  ).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Visão Geral' })).toBeVisible();
  await expect(page.getByText('Receita recorrente mensal (MRR)')).toBeVisible();
  // an Administrador doesn't manage administrators
  await expect(page.getByRole('button', { name: 'Administradores' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Códigos' }).click();
  await page.getByRole('button', { name: '+ Gerar código' }).click();
  await page.getByLabel('Tipo').selectOption('license');
  await page.getByLabel('Número de utilizadores').fill('4');
  await page.getByLabel('Validade').selectOption('life');
  await page.getByRole('button', { name: 'Gerar', exact: true }).click();
  const box = page.locator('.kh-ad-codebox span');
  await expect(box).toHaveText(/^KH-LIC-\d{6}$/);
  const newCode = (await box.textContent())!;
  await page.getByRole('button', { name: 'Concluir' }).click();
  const row = page.locator('.kh-ad-tr', { hasText: newCode });
  await expect(row).toContainText('0 / 4 utilizadores');
  await expect(row).toContainText('Vitalício');
  await row.click();
  await page.locator('.kh-ad-drawer').getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pausar' }).click();
  await expect(row).toContainText('Pausado');

  await page.getByRole('button', { name: 'Auditoria' }).click();
  await page.getByLabel('Contém').fill(newCode);
  await page.getByRole('button', { name: 'Mostrar atividades' }).click();
  await expect(page.locator('.kh-ad-tr', { hasText: 'Gerou código' })).toBeVisible();
  await expect(page.locator('.kh-ad-tr', { hasText: 'Pausou código' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Exportar CSV' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('auditoria.csv');
  const csv = fs.readFileSync((await dl.path())!, 'utf8');
  expect(csv).toContain('Pausou código');
  expect(csv).toContain(newCode);

  // top right: lock and back to the app (the section header used to sit over them)
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  const lock = page.getByRole('dialog', { name: /bloqueado/ });
  await expect(lock).toBeVisible();
  await lock.getByPlaceholder('Password').fill(password);
  await lock.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(lock).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar à App' }).click();
  await page.waitForURL(/\/app$/);
});

async function adminLogin(page: import('@playwright/test').Page) {
  await page.goto('login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // the same TOTP window can't be used twice: wait for the next one
  const box = page.locator('input[autocomplete="one-time-code"]');
  await box.waitFor();
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500));
  await box.fill(totp(secret));
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/app$/);
}

test('console: new pack with its license, subscription edits, suspend', async ({ page }) => {
  test.setTimeout(90_000); // adminLogin may wait up to 30 s for a fresh TOTP window
  await adminLogin(page);

  const name = `Pack E2E ${Date.now()}`;
  await page.goto('admin?s=packs');
  await page.getByRole('button', { name: '+ Novo pack' }).click();
  await page.getByLabel('Nome da empresa (ou da pessoa)').fill(name);
  await page.getByLabel('Email do admin').fill('admin@pack-e2e.pt');
  await page.getByLabel('Pacote', { exact: true }).selectOption('SAP');
  await page.getByLabel('Lugares').fill('12');
  await page.getByRole('button', { name: 'Criar e gerar licença' }).click();
  await expect(page.locator('.kh-ad-codebox span')).toHaveText(/^KH-LIC-\d{6}$/);
  await page.getByRole('button', { name: 'Concluir' }).click();

  await page.locator('.kh-ad-tr', { hasText: name }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('0 / 12')).toBeVisible();
  const seats = page.getByLabel(/^Lugares/);
  await seats.fill('15');
  await seats.blur();
  await expect(page.getByText('0 / 15')).toBeVisible();
  await page.getByRole('button', { name: 'Suspender cliente' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspender' }).click();
  await expect(page.getByRole('button', { name: 'Reativar cliente' })).toBeVisible();
  await page.locator('.kh-ad-chip', { hasText: 'Atividade' }).click();
  await expect(page.locator('.kh-ad-tr', { hasText: 'Suspendeu cliente' })).toBeVisible();
  await expect(page.locator('.kh-ad-tr', { hasText: 'Criou cliente' })).toBeVisible();
});

test('plans window: a FREE user asks for PRO, the console approves it', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const who = `free-${Date.now()}@example.com`;
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'FREE'))![0];
  await page.goto('register');
  await page.getByLabel('Nome').fill('Free Asker');
  await page.getByLabel('Email').fill(who);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink(who));
  await page.goto('login');
  await page.getByLabel('Email').fill(who);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/app$/);

  await page.goto('app/pricing');
  const dialog = page.getByRole('dialog', { name: 'Escolha o plano certo para si' });
  const free = dialog.locator('.kh-pr-card', { hasText: 'Para começar' });
  await expect(free.getByRole('button', { name: 'Plano atual' })).toBeDisabled();
  const pro = dialog
    .locator('.kh-pr-card')
    .filter({ has: page.locator('.kh-pr-chip', { hasText: /^PRO$/ }) });
  await pro.getByRole('button', { name: /Pedir este plano/ }).click();
  await expect(page.getByRole('status')).toContainText('Recebemos o seu pedido para PRO');
  await expect(pro.getByRole('button', { name: 'Pedido enviado ✓' })).toBeDisabled();

  const ctx = await browser.newContext({
    locale: 'pt-PT',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.122' },
  });
  const adm = await ctx.newPage();
  await adminLogin(adm);
  await adm.goto('admin?s=requests');
  const row = adm.locator('.kh-ad-tr', { hasText: who });
  await expect(row).toContainText('PRO');
  await row.getByRole('button', { name: 'Aprovar' }).click();
  await adm.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click();
  await expect(adm.getByText('Pedido aprovado.')).toBeVisible();
  await adm.locator('.kh-ad-chip', { hasText: 'Todos' }).click();
  await expect(adm.locator('.kh-ad-tr', { hasText: who })).toContainText('Aprovado');
  await ctx.close();

  await page.reload();
  await expect(pro.getByRole('button', { name: 'Plano atual' })).toBeDisabled();
});
