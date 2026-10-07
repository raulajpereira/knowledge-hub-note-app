import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 5.3 Tarefas de Projeto: table + Kanban, detail panel, Calendar, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `issues-${Date.now()}@example.com`;
const password = 'Issues-Strong-Pass-1';

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
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Issues Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'issues');
});

test('create, edit, move on the Kanban, see it on the Calendar, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/issues');
  await expect(page.getByText('Sem problemas para este filtro.')).toBeVisible();
  await page.getByRole('button', { name: 'Novo Problema' }).click();
  const panel = page.locator('.kh-is-panel');
  await panel.getByLabel('Título').fill('IDoc ORDERS05 em erro 51');
  await panel.getByRole('button', { name: 'Crítica' }).click();
  await panel.getByLabel('À espera de').fill('Equipa Basis');
  const due = new Date();
  const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  await panel.getByLabel('Prazo').fill(iso);
  await expect(page.locator('.kh-is-tr')).toContainText('IDoc ORDERS05 em erro 51');
  await expect(page.locator('.kh-is-tr')).toContainText('Crítica');
  await page.waitForTimeout(900); // debounced text fields

  await page.reload();
  await expect(page.locator('.kh-is-tr')).toContainText('Equipa Basis');
  await page.getByRole('radio', { name: 'Kanban' }).click();
  await page
    .locator('.kh-is-panel')
    .getByRole('button', { name: 'Fechar' })
    .click()
    .catch(() => {});
  const card = page.locator('.kh-is-card', { hasText: 'IDoc ORDERS05' });
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer: dt });
  await page.locator('.kh-is-col').nth(3).dispatchEvent('dragover', { dataTransfer: dt });
  await page.locator('.kh-is-col').nth(3).dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.locator('.kh-is-col').nth(3).locator('.kh-is-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('radio', { name: 'Kanban' }).click();
  await expect(page.locator('.kh-is-col').nth(3)).toContainText('IDoc ORDERS05');
  await expect(page.locator('.kh-is-title')).toContainText('0 por resolver · 1 total');

  await page.goto('app/calendar');
  await page.getByRole('button', { name: /Concluídos/ }).click();
  await expect(page.locator('.kh-cal__item', { hasText: 'IDoc ORDERS05' })).toBeVisible();
  await page.locator('.kh-cal__item', { hasText: 'IDoc ORDERS05' }).click();
  await page.waitForURL(/\/app\/issues\?i=/);
  await page.locator('.kh-is-panel').getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto('app/trash');
  await expect(page.getByText('IDoc ORDERS05 em erro 51')).toBeVisible();
});
