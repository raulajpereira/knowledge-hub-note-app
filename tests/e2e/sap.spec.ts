import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 7 SAP: systems (list, cards, SAP GUI shortcut), transactions, header popup, settings,
// transport requests and the Code Library SAP.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `sap-${Date.now()}@example.com`;
const password = 'Sap-Strong-Pass-1';

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
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'SAP'))![0];
  // Registration is limited to 10 per hour and IP and the other specs already
  // use them all; this one registers from its own (documentation) address.
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.71' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Sap Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const read = async (d: import('@playwright/test').Download) => fs.readFileSync((await d.path())!, 'utf8');

test('systems, transactions, header popup and SAP GUI settings', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);

  // Definições › SAP GUI: start transaction used by every shortcut
  await page.goto('app/settings');
  await page.getByRole('tab', { name: 'SAP GUI' }).click();
  await page.getByLabel('Transação inicial').fill('se38');
  await expect(page.getByLabel('Transação inicial')).toHaveValue('SE38');
  await page.waitForTimeout(800); // prefs are saved debounced

  await page.goto('app/systems');
  await expect(page.getByText('Sem sistemas para este filtro.')).toBeVisible();
  await page.getByRole('button', { name: 'Novo Sistema' }).click();
  await page.getByLabel('Sistema', { exact: true }).fill('BSQ - QAS');
  await page.getByLabel('SID', { exact: true }).fill('bsq');
  await expect(page.getByLabel('SID', { exact: true })).toHaveValue('BSQ');
  await page.getByLabel('Servidor').fill('172.16.23.4');
  await page.getByLabel('Mandante').fill('200');
  await page.getByRole('button', { name: 'QAS', exact: true }).click();
  const dl = page.waitForEvent('download');
  await page
    .locator('.kh-sap-pacts')
    .getByRole('button', { name: /SAP GUI/ })
    .click();
  const sap = await read(await dl);
  expect(sap).toContain('GuiParm=/H/172.16.23.4/S/3200');
  expect(sap).toContain('Client=200');
  expect(sap).toContain('Command=SE38');

  await page.waitForTimeout(800); // debounced save
  await page.reload();
  await page.getByRole('radio', { name: 'Lista' }).click();
  const row = page.getByRole('row').filter({ hasText: 'BSQ - QAS' });
  await expect(row).toContainText('QAS');
  await row.getByRole('button', { name: 'Favorito BSQ - QAS' }).click();
  await page.getByRole('radio', { name: 'Cartões' }).click();
  await expect(page.locator('.kh-sap-card')).toHaveCount(1);
  await page.locator('.kh-sap-card').getByRole('button', { name: 'Copiar' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('SID: BSQ');

  // Início › Acesso Rápido SAP shows the favourite
  await page.goto('app');
  await expect(page.getByRole('button', { name: /BSQ/ }).first()).toBeVisible();

  // transaction library seeded from the prototype
  await page.goto('app/tcodes');
  await expect(page.getByText('23 transações')).toBeVisible();
  await page.getByRole('button', { name: 'Nova Transação' }).click();
  await page.getByLabel('Transação', { exact: true }).fill('zsd_price');
  await page.getByLabel('Descrição', { exact: true }).fill('Preços especiais');
  await page.getByLabel('Tipo', { exact: true }).selectOption('param');
  await page.getByLabel('Parâmetros').fill('VIEWNAME=ZV_SD_PRICE');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText('24 transações')).toBeVisible();
  await page.getByPlaceholder('Procurar transação, descrição, programa…').fill('preços');
  await expect(page.getByRole('row').filter({ hasText: 'ZSD_PRICE' })).toBeVisible();

  // header popup: search and Enter copies the code
  await page.getByRole('button', { name: 'SAP TCodes' }).click();
  const pop = page.getByRole('dialog', { name: 'SAP TCodes' });
  await pop.getByLabel('Transação, programa, descrição, módulo…').fill('va0');
  await pop.getByLabel('Transação, programa, descrição, módulo…').press('Enter');
  await expect(pop.getByText('✓ Copiado')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('VA01');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);

  // delete → Trash
  await page.getByRole('row').filter({ hasText: 'ZSD_PRICE' }).click();
  await page.getByRole('button', { name: 'Eliminar Transação' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto('app/trash');
  await expect(page.getByText('ZSD_PRICE · Preços especiais')).toBeVisible();
});

test('transport requests: new, steps, route, filters, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/transports');
  await expect(page.getByText('Sem ordens para este filtro.')).toBeVisible();
  await page.getByRole('button', { name: 'Nova Ordem' }).click();
  await page.getByLabel('Código', { exact: true }).fill('bsqk900123');
  await expect(page.getByLabel('Código', { exact: true })).toHaveValue('BSQK900123');
  await page.getByLabel('Descrição', { exact: true }).fill('Config. Regime SS');
  await page.getByLabel('Tipo', { exact: true }).selectOption('C');
  const step = (n: string) => page.getByRole('checkbox', { name: new RegExp(n) });
  await step('Libertada').click();
  await expect(step('Libertada')).toHaveAttribute('aria-checked', 'true');
  await step('Importada em QAS').click();
  await expect(page.getByRole('button', { name: /Em QAS/ })).toContainText('1');

  await page.waitForTimeout(800);
  await page.reload();
  await page.getByRole('radio', { name: 'Pista' }).click();
  const row = page.locator('.kh-ot-prow').filter({ hasText: 'BSQK900123' });
  await expect(row).toContainText('Customizing');
  await expect(row.locator('.kh-ot-pill')).toHaveCount(3);

  // multi-select filter by type
  await page.getByRole('button', { name: /^Tipo/ }).click();
  await page
    .getByRole('listbox', { name: 'Tipo' })
    .getByRole('option', { name: /Workbench/ })
    .click();
  await expect(page.getByText('0 / 1')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByText('1 / 1')).toBeVisible();

  // Início › Ordens em Curso
  await page.goto('app');
  await expect(page.getByRole('link', { name: /BSQK900123/ })).toBeVisible();

  await page.goto('app/transports');
  await page.getByRole('radio', { name: 'Lista' }).click();
  await page.getByRole('row').filter({ hasText: 'BSQK900123' }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto('app/trash');
  await expect(page.getByText('BSQK900123 · Config. Regime SS')).toBeVisible();
});

test('code library SAP: new class, method, generated pool, include reference, Relações, Trash', async ({
  page,
}) => {
  await login(page);
  await page.goto('app/codelib');
  await expect(page.getByText('Selecione um objeto.')).toBeVisible();

  // a class with one method: the generated class pool follows the configuration
  await page.getByRole('button', { name: 'Novo Objeto' }).click();
  await page.getByRole('menuitem', { name: /Classes/ }).click();
  const name = page.getByLabel('Objeto de Código');
  await expect(name).toHaveValue('ZCL_NEW_CLASS');
  await name.fill('zcl hr mailer');
  await expect(name).toHaveValue('ZCL_HR_MAILER');
  await page.getByRole('button', { name: 'Novo Método' }).click();
  await page.getByLabel('Nome do componente').fill('send mail');
  await expect(page.getByLabel('Nome do componente')).toHaveValue('SEND_MAIL');
  await page.getByRole('tab', { name: 'Código' }).click();
  await expect(page.getByRole('textbox', { name: 'SEND_MAIL' })).toHaveValue(/METHOD send_mail\./);
  await page.getByRole('button', { name: /Pool de Classe/ }).click();
  await expect(page.locator('.kh-ab-hl')).toContainText('METHODS send_mail');
  await expect(page.locator('.kh-ab-hl')).toContainText('CLASS zcl_hr_mailer IMPLEMENTATION.');

  // saved on the server
  await expect
    .poll(async () => {
      const r = (await (await page.request.get('api/v1/sap/objects')).json()) as {
        objects: Array<{ name: string; nodes: Array<{ g: string; label: string }> }>;
      };
      return r.objects.find((o) => o.name === 'ZCL_HR_MAILER')?.nodes.find((n) => n.g === 'meth')?.label;
    })
    .toBe('SEND_MAIL');
  await page.reload();
  await expect(page.locator('.kh-cl-item').filter({ hasText: 'ZCL_HR_MAILER' })).toContainText('1 met');

  // a program with an include: Ctrl/⌘ + click on the name opens it, then "Voltar"
  await page.getByRole('button', { name: 'Novo Objeto' }).click();
  await page.getByRole('menuitem', { name: /Programas/ }).click();
  await page.getByRole('button', { name: 'Novo Include' }).click();
  await expect(page.getByLabel('Nome do componente')).toHaveValue('ZNEW_PROGRAM_F02');
  await page.getByRole('button', { name: /^ZNEW_PROGRAM\b.*Main program/ }).click();
  const main = page.getByRole('textbox', { name: 'ZNEW_PROGRAM' });
  await main.fill('REPORT znew_program.\n\nINCLUDE znew_program_f02.\n');
  const ref = page.locator('.kh-ab-ref', { hasText: 'znew_program_f02' });
  await expect(ref).toBeVisible();
  const box = (await ref.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Control');
  await expect(page.getByLabel('Nome do componente')).toHaveValue('ZNEW_PROGRAM_F02');
  await page.getByRole('button', { name: 'Voltar a ZNEW_PROGRAM' }).click();
  await expect(main).toBeVisible();

  // search covers the code; filters by transaction
  await page.getByLabel('Pesquisar objetos, código, tags…').fill('send_mail');
  await expect(page.locator('.kh-cl-item')).toHaveCount(1);
  await page.getByLabel('Pesquisar objetos, código, tags…').fill('');
  await page.getByRole('button', { name: /^SE38/ }).click();
  await expect(page.locator('.kh-cl-item')).toHaveCount(1);
  await page.getByRole('button', { name: /^Todas/ }).click();

  // Relações: links and transport requests
  await page.getByRole('button', { name: /Ligações.*Notas, tarefas e ordens/ }).click();
  await expect(page.getByRole('group', { name: 'Ligações' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ordens de Transporte' })).toContainText(
    'Nenhuma ordem associada.',
  );

  // Trash
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-cl-item')).toHaveCount(1);
  await page.goto('app/trash');
  await expect(page.getByText('ZNEW_PROGRAM', { exact: true })).toBeVisible();
});

test('functional SAP: a test case with steps, progress, filters and Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/fn-test');
  await expect(page.getByText('Selecione ou crie um registo.')).toBeVisible();
  await page.getByRole('button', { name: 'Novo registo' }).click();
  await page.getByLabel('ID do teste').fill('UAT-SD-014');
  await page.getByLabel('Título').fill('Venda nacional com desconto');
  await page.getByLabel('Módulo', { exact: true }).selectOption('SD');
  await page.getByLabel('Tipo de teste').selectOption('UAT');
  await page.getByRole('button', { name: '+ Linha' }).click();
  await page.getByRole('button', { name: '+ Linha' }).click();
  await page.getByLabel('Passo 1').fill('Criar encomenda ZOR');
  await page.getByLabel('Resultado 1').selectOption('pass');
  await expect(page.getByText('50% concluído')).toBeVisible();
  await page.getByLabel('Estado', { exact: true }).selectOption('run');

  // saved on the server before reloading
  await expect
    .poll(async () => {
      const r = (await (await page.request.get('api/v1/sap/functional?page=fn_test')).json()) as {
        records: Array<{ code: string; st: string; rows: Array<{ st?: string }> }>;
      };
      const x = r.records[0];
      return x ? [x.code, x.st, x.rows[0]?.st] : null;
    })
    .toEqual(['UAT-SD-014', 'run', 'pass']);
  await page.reload();
  const item = page.locator('.kh-fn-item').filter({ hasText: 'Venda nacional com desconto' });
  await expect(item).toContainText('Em execução');
  await expect(item).toContainText('UAT-SD-014');
  await expect(page.getByLabel('Passo 1')).toHaveValue('Criar encomenda ZOR');
  await expect(page.getByText('50% concluído')).toBeVisible();

  // filters: by status and by module
  await page.getByRole('button', { name: /^Falhou/ }).click();
  await expect(page.getByText('Sem registos.')).toBeVisible();
  await page.getByRole('button', { name: /^Todos/ }).click();
  await page.getByLabel('Todos os módulos').selectOption('SD');
  await expect(item).toBeVisible();

  // pages are separate: Cutover is empty
  await page.goto('app/fn-cut');
  await expect(page.getByText('Selecione ou crie um registo.')).toBeVisible();

  await page.goto('app/fn-test');
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.getByText('Sem registos.')).toBeVisible();
  await page.goto('app/trash');
  await expect(page.getByText('UAT-SD-014 · Venda nacional com desconto')).toBeVisible();
});
