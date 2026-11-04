import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

// Command palette (Ctrl/⌘ + K), "Importar notas" (Markdown with a checklist,
// an Evernote .enex with two notes), the project profitability block, and the
// "Exportar .xlsx" of Projetos / Tickets (real files read back with exceljs).
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `prod-${Date.now()}@example.com`;
const password = 'Prod-Strong-Pass-1';
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
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'ULTRA'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.208' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Ana Produtiva');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await login(page);
  expect((await page.request.post('api/v1/mg/sample')).ok()).toBe(true);
  await page.close();
});

test('the command palette goes to pages, runs app commands and creates a task', async ({ page }) => {
  await login(page);
  await page.keyboard.press('Control+k');
  const dlg = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await expect(dlg).toBeVisible();
  // nothing typed: what can be created and the app commands
  await expect(dlg.getByRole('option', { name: 'Nova nota' })).toBeVisible();
  await expect(dlg.getByRole('option', { name: 'Bloquear App' })).toBeVisible();
  // a page, without accents
  await dlg.getByRole('combobox').fill('alocacoes');
  await expect(dlg.getByRole('option', { name: 'Alocações', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/app\/mg-alloc/);
  await expect(dlg).toBeHidden();
  // Ctrl+K again, a new task opens on its page
  await page.keyboard.press('Control+k');
  await dlg.getByRole('combobox').fill('nova tarefa');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/app\/tasks\?t=/);
  // Escape closes; the header hint opens it too
  await page.getByRole('button', { name: 'Paleta de comandos' }).click();
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test('Importar notas: Markdown with a checklist and an Evernote export become notes', async ({ page }) => {
  await login(page);
  await page.goto('app/notes?import=1');
  const dlg = page.getByRole('dialog', { name: 'Importar notas' });
  await expect(dlg).toBeVisible();
  const md = [
    '# Plano de cutover',
    '',
    'Com o **cliente**.',
    '',
    '- [x] Backup do PRD',
    '- [ ] Correr SUM',
    '',
    '| Passo | Horas |',
    '|---|---|',
    '| Export | 4 |',
  ].join('\n');
  const enex = `<?xml version="1.0" encoding="UTF-8"?><en-export>
<note><title>Workshop</title><content><![CDATA[<en-note><div>Agenda</div><div><en-todo checked="true"/>Slides</div></en-note>]]></content></note>
<note><title>Contactos</title><content><![CDATA[<en-note><ul><li>Ana</li></ul></en-note>]]></content></note>
</en-export>`;
  await dlg.locator('input[type=file]').setInputFiles([
    { name: 'cutover.md', mimeType: 'text/markdown', buffer: Buffer.from(md) },
    { name: 'evernote.enex', mimeType: 'application/xml', buffer: Buffer.from(enex) },
  ]);
  await expect(dlg.getByText('Plano de cutover', { exact: true })).toBeVisible();
  await dlg.getByRole('button', { name: 'Importar 3' }).click();
  await expect(dlg.getByText('3 notas importadas')).toBeVisible({ timeout: 30_000 });
  await dlg.getByRole('button', { name: 'Concluir' }).click();
  await page.locator('.kh-nt-card', { hasText: 'Plano de cutover' }).first().click();
  const editor = page.locator('.ProseMirror').first();
  await expect(editor.getByText('Correr SUM').first()).toBeVisible();
  await expect(editor.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  await expect(editor.locator('table')).toBeVisible();
  await page.locator('.kh-nt-card', { hasText: 'Workshop' }).first().click();
  await expect(editor.locator('li[data-checked="true"]', { hasText: 'Slides' })).toBeVisible();
});

test('a project shows its profitability and Projetos exports a real .xlsx', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-projects');
  await expect(page.getByText('Rentabilidade', { exact: true })).toBeVisible();
  await expect(page.getByText('Margem até hoje')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Receita acumulada' })).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar .xlsx' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^Projetos \d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await dl.path());
  const ws = wb.worksheets[0]!;
  expect(ws.getCell('A1').value).toBe('Projetos');
  expect(ws.getRow(4).values).toEqual(expect.arrayContaining(['Código', 'Orçamento', 'Margem %']));
  expect(ws.rowCount).toBeGreaterThan(6);
  const total = ws.getRow(ws.rowCount);
  expect(total.getCell(1).value).toBe('Total');
  expect(JSON.stringify(total.getCell(9).value)).toContain('SUBTOTAL(109');
});

test('Tickets exports the list it shows', async ({ page }) => {
  await login(page);
  const r = await page.request.post('api/v1/tickets', {
    data: { number: 'INC-1001', summary: 'Erro na fatura', priority: 'high' },
  });
  expect(r.ok()).toBe(true);
  await page.goto('app/tickets');
  await expect(page.getByText('INC-1001')).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar .xlsx' }).click(),
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await dl.path());
  const ws = wb.worksheets[0]!;
  expect(ws.getCell('A5').value).toBe('INC-1001');
  expect(ws.getCell('B5').value).toBe('Erro na fatura');
  expect(ws.getCell('E5').value).toBe('Alta');
});
