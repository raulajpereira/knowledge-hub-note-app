import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';

// Orçamentos: fill the matrix, upload and map the Excel model, make a budget from the matrix, download it.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `budget-${Date.now()}@example.com`;
const password = 'Budget-Strong-Pass-1';

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
  const page = await browser.newPage({
    locale: 'pt-PT',
    // own IP: the register limit (10/h per IP) is shared by every spec without one
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.219' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Budget Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

async function model(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet('Orçamento');
  s.getCell('A1').value = 'Cliente';
  ['#', 'Descrição', 'Tipo de Recurso', '# Recurso', 'Custo Unit.'].forEach(
    (v, i) => (s.getRow(5).getCell(i + 1).value = v),
  );
  s.getCell('A6').value = 'Serviços';
  s.getCell('A9').value = 'Sub-Total';
  s.getCell('F9').value = { formula: 'SUM(F7:F8)', result: 0 };
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kh-bg-')), 'PL_teste.xlsx');
  await wb.xlsx.writeFile(f);
  return f;
}

test('matrix, model, a budget from the matrix and its Excel', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-budget?tab=matrix');
  await expect(page.getByRole('heading', { name: 'Orçamentos' })).toBeVisible();
  // the SF modules are there; give ECP its days
  await page.getByRole('row', { name: /Employee Central Payroll/ }).click();
  const feed = page.getByRole('dialog', { name: 'Alimentar valores' });
  await feed.getByLabel('Consultor SAP SF Employee Central Payroll · Greenfield').fill('50');
  await feed.getByLabel('Técnico ABAP · Greenfield').fill('10');
  await feed.getByRole('button', { name: 'Guardar matriz' }).click();
  await expect(feed).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Employee Central Payroll/ })).toContainText('50');

  // the Excel model: uploaded, its mapping guessed and saved
  await page.locator('input[type=file]').setInputFiles(await model());
  const map = page.getByRole('dialog', { name: 'Mapear modelo' });
  await expect(map.getByText('linhas 7–8')).toBeVisible();
  await map.getByRole('button', { name: 'Guardar mapeamento' }).click();
  await expect(map).toHaveCount(0);

  // a budget: free-text client, ECP → two lines from the matrix
  await page.getByRole('radio', { name: 'Orçamentos' }).click();
  await page.getByRole('button', { name: /Novo orçamento/ }).click();
  const nb = page.getByRole('dialog', { name: 'Novo orçamento' });
  await nb.getByLabel('Cliente', { exact: true }).fill('Cliente E2E');
  await nb.getByRole('button', { name: /Employee Central Payroll/ }).click();
  await nb.getByRole('button', { name: 'Criar orçamento' }).click();
  await expect(page.getByRole('heading', { name: 'Cliente E2E' })).toBeVisible();
  await expect(page.getByLabel('Descrição no Excel').first()).toHaveValue(
    'Consultor SAP SF Employee Central Payroll',
  );
  await expect(page.getByLabel('Descrição no Excel').nth(1)).toHaveValue('Técnico ABAP');

  await page.getByRole('button', { name: /Gerar Excel/ }).click();
  const xl = page.getByRole('dialog', { name: 'Gerar Excel' });
  await expect(xl).toContainText('Consultor SAP SF Employee Central Payroll');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    xl.getByRole('button', { name: /Descarregar/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^Orcamento_Cliente_E2E_ORC-\d{4}-001\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await dl.path())!);
  const ws = wb.getWorksheet('Orçamento')!;
  expect(ws.getCell('B1').value).toBe('Cliente E2E');
  expect(ws.getCell('A7').value).toBe(50);
  expect(ws.getCell('B8').value).toBe('Técnico ABAP');
});
