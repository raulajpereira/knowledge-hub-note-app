import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 4.1 Notes: notebooks, the TipTap editor (toolbar only, as in the
// "Go-live SuccessFactors" acceptance note), autosave, Ligações and the Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `notes-${Date.now()}@example.com`;
const password = 'Notes-Strong-Pass-1';

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
  const out = execFileSync(
    'npx',
    ['tsx', 'src/cli/index.ts', 'codes:create', '--type', 'license', '--plan', 'PRO'],
    {
      encoding: 'utf8',
    },
  );
  const code = /KH-LIC-\d{6}/.exec(out)![0];
  const page = await browser.newPage({ locale: 'pt-PT' });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Notes Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const tool = (page: Page, name: string) =>
  page.getByRole('toolbar').getByRole('button', { name, exact: true });

test('notebook + note written with the toolbar only, saved and reloaded', async ({ page }) => {
  await login(page);
  await page.goto('app/notes');
  await page.getByRole('button', { name: 'Nova Pasta' }).click();
  await page.getByLabel('Nome da pasta').fill('Ferramentas & debug');
  await page.keyboard.press('Enter');
  await expect(page.locator('.kh-nt-list__title')).toContainText('Ferramentas & debug');

  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Go-live SuccessFactors → SAP HCM: checklist');
  await page.keyboard.press('Enter');
  const ed = page.locator('.kh-ne');
  await page.keyboard.type('Documentação no SAP Help Portal');
  for (let i = 0; i < 15; i++) await page.keyboard.press('Shift+ArrowLeft');
  await tool(page, 'Ligação').click();
  await page.getByLabel('Endereço do link ou nome de uma nota').fill('help.sap.com');
  await page.getByRole('button', { name: 'Inserir' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await tool(page, 'Título').click();
  await page.keyboard.type('Checklist de go-live');
  await page.keyboard.press('Enter');
  await tool(page, 'Lista de tarefas').click();
  for (const s of ['Transportar a ordem', 'Criar a destination', 'Agendar o job']) {
    await page.keyboard.type(s);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Enter');
  await tool(page, 'Aviso').click();
  await page.keyboard.type('Verificar o certificado na STRUST.');
  await ed.locator('ul[data-type=taskList] input[type=checkbox]').first().check();
  await expect(page.locator('.kh-ne-progress')).toContainText('1 / 3');

  await expect(ed.locator('a[href="https://help.sap.com"]')).toHaveText('SAP Help Portal');
  await page.waitForTimeout(1200); // autosave debounce
  await page.reload();
  await expect(page.getByLabel('Sem título')).toHaveValue('Go-live SuccessFactors → SAP HCM: checklist');
  await expect(ed.locator('h2')).toHaveText('Checklist de go-live');
  await expect(ed.locator('ul[data-type=taskList] li')).toHaveCount(3);
  await expect(ed.locator('[data-callout]')).toHaveText('Verificar o certificado na STRUST.');
  await expect(page.locator('.kh-ne-progress')).toContainText('33%');
  await expect(page.locator('.kh-nt-card').first()).toContainText('Documentação no SAP Help Portal');
  await expect(page.getByRole('complementary', { name: 'Navigation' }).locator('.kh-nav__count')).toHaveText(
    '1',
  );
});

test('favourites, header search, links between notes', async ({ page }) => {
  await login(page);
  await page.goto('app/notes');
  await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click();
  await page.locator('.kh-nt-folder', { hasText: 'Favoritos' }).click();
  await expect(page.locator('.kh-nt-card')).toHaveCount(1);

  await page.locator('.kh-nt-folder', { hasText: 'Todas as Notas' }).click();
  await page.getByRole('button', { name: 'Nova Nota' }).last().click();
  await expect(page.getByLabel('Sem título')).toHaveValue('');
  await page.getByLabel('Sem título').fill('Debug de jobs');
  await page.getByPlaceholder('Pesquisar itens para ligar…').click();
  await page.locator('.kh-nt-insp__results > div', { hasText: 'Go-live' }).click();
  await expect(page.locator('.kh-nt-link')).toContainText('Go-live SuccessFactors');

  await page.getByRole('textbox', { name: 'Pesquisar notas, objetos, transações…' }).fill('STRUST');
  await expect(page.locator('.kh-nt-card')).toHaveCount(1);
  await expect(page.locator('.kh-nt-card')).toContainText('Go-live');
});

test('Trash: delete, restore, delete permanently', async ({ page }) => {
  await login(page);
  await page.goto('app/notes');
  await page.locator('.kh-nt-card', { hasText: 'Debug de jobs' }).click();
  await page.locator('.kh-nt-editor__bar').getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-nt-card', { hasText: 'Debug de jobs' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Lixo' }).click();
  await expect(page.locator('.kh-tr__row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Recuperar', exact: true }).click();
  await expect(page.getByText('O Lixo está vazio')).toBeVisible();

  await page.goto('app/notes');
  await page.locator('.kh-nt-card', { hasText: 'Debug de jobs' }).click();
  await page.locator('.kh-nt-editor__bar').getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto('app/trash');
  await page.getByRole('button', { name: 'Eliminar Definitivamente' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar Definitivamente' }).click();
  await expect(page.getByText('O Lixo está vazio')).toBeVisible();
});
