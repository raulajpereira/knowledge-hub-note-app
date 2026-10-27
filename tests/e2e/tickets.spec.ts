import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Tickets (SAP › Tickets): create (unique number), edit, Kanban drag changes the
// status and logs it, filter, comment, link a note, Trash and restore; phones.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `tickets-${Date.now()}@example.com`;
const password = 'Tickets-Strong-Pass-1';

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
  // its own address for the registration limit (10 an hour per IP)
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.190' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Tickets Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

async function newTicket(page: Page, number: string, summary: string) {
  await page.getByRole('button', { name: 'Novo ticket' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo ticket' });
  await dlg.getByLabel('Nº Ticket *').fill(number);
  await dlg.getByLabel('Descrição *').fill(summary);
  await dlg.getByRole('button', { name: 'Criar ticket' }).click();
  return dlg;
}

test('create, edit, comment, link, Kanban, filter, Trash', async ({ page }) => {
  await login(page);
  // a note to link to
  const r = await page.request.post('api/v1/notes', { data: { title: 'Análise do erro M7' } });
  expect(r.ok()).toBe(true);

  await page.goto('app/tickets');
  await expect(page.getByRole('link', { name: 'Tickets' })).toBeVisible();
  await expect(page.getByText('Ainda sem tickets.')).toBeVisible();
  await expect(await newTicket(page, 'INC0001', 'MIGO dá erro M7 021')).toHaveCount(0);
  await expect(page.getByLabel('Nº Ticket', { exact: true })).toHaveValue('INC0001');
  // the same number again (any case): the friendly error, nothing created
  const dlg = await newTicket(page, 'inc0001', 'Outro');
  await expect(dlg.getByText('Já existe um ticket com este número')).toBeVisible();
  await dlg.getByLabel('Nº Ticket *').fill('INC0002');
  await dlg.getByRole('button', { name: 'Criar ticket' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.kh-table__row')).toHaveCount(2);

  // edit INC0001: priority, client as a free name, a comment, a link to the note
  await page.locator('.kh-table__row', { hasText: 'INC0001' }).click();
  const panel = page.locator('.kh-sap-panel');
  await panel.getByRole('radio', { name: 'Alta', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Cliente', exact: true }).fill('Atlas Seguros');
  await panel.getByRole('textbox', { name: 'Cliente', exact: true }).press('Enter');
  await panel.getByLabel('Registar trabalho ou comentário…').fill('Reproduzido em QAS.');
  await panel.getByRole('button', { name: 'Comentar' }).click();
  await expect(panel.locator('.kh-tkt-ev__body')).toHaveText('Reproduzido em QAS.');
  await expect(panel.getByText('mudou a prioridade')).toBeVisible();
  await panel.getByPlaceholder('Pesquisar itens para ligar…').fill('Análise');
  await panel.getByRole('option', { name: /Análise do erro M7/ }).click();
  await expect(panel.locator('.kh-cx__link', { hasText: 'Análise do erro M7' })).toBeVisible();
  await expect(page.locator('.kh-table__row', { hasText: 'INC0001' })).toContainText('Atlas Seguros');

  // Kanban: drag INC0001 to Resolvido → status saved and logged
  await page.getByRole('radio', { name: 'Kanban' }).click();
  await panel.getByRole('button', { name: 'Fechar' }).click();
  const card = page.locator('.kh-tkt-kcard', { hasText: 'INC0001' });
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const col = page.getByRole('group', { name: 'Resolvido' });
  await card.dispatchEvent('dragstart', { dataTransfer: dt });
  await col.dispatchEvent('dragover', { dataTransfer: dt });
  await col.dispatchEvent('drop', { dataTransfer: dt });
  await expect(col.locator('.kh-tkt-kcard')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Resolvido' })).toContainText('INC0001');
  await page.getByRole('group', { name: 'Resolvido' }).locator('.kh-tkt-kcard').click();
  await expect(panel.getByText('mudou o status')).toBeVisible();
  // the resolution date was set by itself
  await expect(panel.getByLabel('Resolução / Fecho')).not.toHaveValue('');

  // filter by status (table)
  await page.getByRole('radio', { name: 'Tabela' }).click();
  await page.locator('.kh-ot-f').first().getByRole('button').click();
  await page.getByRole('option', { name: /Resolvido/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.kh-table__row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.locator('.kh-table__row')).toHaveCount(2);

  // Trash and back
  await page.locator('.kh-table__row', { hasText: 'INC0002' }).click();
  await panel.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-table__row')).toHaveCount(1);
  await page.goto('app/trash');
  const row = page.locator('.kh-tr__row', { hasText: 'INC0002' });
  await expect(row).toContainText('Ticket');
  await row.getByRole('button', { name: 'Recuperar' }).click();
  await expect(row).toHaveCount(0);
  await page.goto('app/tickets');
  await expect(page.locator('.kh-table__row')).toHaveCount(2);
});

test('phone: tickets as cards, the ticket full-page with Voltar', async ({ browser }) => {
  const ctx = await browser.newContext({
    locale: 'pt-PT',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await login(page);
  await page.goto('app/tickets');
  const cards = page.locator('.kh-table-card');
  await expect(cards).toHaveCount(2);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
  await cards.filter({ hasText: 'INC0001' }).click();
  await expect(page.getByLabel('Nº Ticket', { exact: true })).toHaveValue('INC0001');
  await expect(page.locator('.kh-sap-main')).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(cards).toHaveCount(2);
  await ctx.close();
});
