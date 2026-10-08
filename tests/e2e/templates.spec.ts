import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Modelos: ready-made SAP templates and the person's own, in Registos Reuniões, Cutover and Projetos.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `templates-${Date.now()}@example.com`;
const password = 'Templates-Strong-Pass-1';

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
  // its own address for the registration limit (10 an hour per IP)
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.143' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Templates Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  for (const m of ['meetings', 'fn_cut', 'mg_projects', 'mg_clients'])
    cli('tenants:module', '--email', email, '--add', m);
});

/** The values of every text field on the page (checklists and table rows are inputs). */
const values = (page: Page) =>
  page.locator('input, textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('meeting record from a ready-made template; save, reuse and delete my own', async ({ page }) => {
  await login(page);
  await page.goto('app/meetings');
  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Modelos' });
  await expect(menu.getByText('Ainda não tem modelos.', { exact: false })).toBeVisible();
  await menu.getByRole('menuitem', { name: /Comité de Direção \(Steering\)/ }).click();
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Comité de Direção');
  await expect(page.locator('.kh-mt-topics')).toHaveValue(/Estado geral \(RAG/);
  await expect.poll(() => values(page)).toContain('Agendar o próximo comité');

  await page.getByRole('button', { name: 'Guardar como modelo' }).click();
  const dlg = page.getByRole('dialog', { name: 'Guardar como modelo' });
  await expect(dlg.getByLabel('Nome do modelo')).toHaveValue('Comité de Direção');
  await dlg.getByLabel('Nome do modelo').fill('Steering Banco SOL');
  await dlg.getByRole('button', { name: 'Guardar modelo' }).click();
  await expect(page.getByText('Modelo guardado')).toBeVisible();

  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Steering Banco SOL' }).click();
  await expect(page.locator('.kh-mt-item').filter({ hasText: 'Comité de Direção' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await menu.getByRole('button', { name: 'Eliminar Steering Banco SOL' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await expect(menu.getByText('Ainda não tem modelos.', { exact: false })).toBeVisible();
});

test('cutover runbook and SAP Activate phases from templates', async ({ page }) => {
  await login(page);
  await page.goto('app/fn-cut');
  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await page.getByRole('menuitem', { name: /Runbook de cutover S\/4HANA/ }).click();
  await expect(page.locator('.kh-fn-title')).toHaveValue('Runbook de cutover');
  await expect.poll(() => values(page)).toContain('[Cutover] Carga de saldos do razão');

  await page.goto('app/mg-projects');
  await page.getByRole('button', { name: 'Novo Projeto' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo Projeto' });
  await dlg.getByLabel('Nome', { exact: true }).fill('Projeto Modelos');
  await dlg.getByRole('tab', { name: 'Novo Cliente' }).click();
  await dlg.getByLabel('Nome do cliente').fill('Cliente Modelos');
  await dlg.getByRole('button', { name: 'Criar Projeto' }).click();
  await expect(dlg).toBeHidden();
  await page.getByRole('button', { name: 'Modelos', exact: true }).click();
  await page.getByRole('menuitem', { name: /SAP Activate — implementação/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar modelo' }).click();
  await expect(page.getByLabel('Fases 1')).toHaveValue('Prepare');
  await expect(page.getByLabel('Fases 5')).toHaveValue('Run (Hypercare)');
  await expect(page.getByLabel('Fases 6')).toHaveCount(0);
});
