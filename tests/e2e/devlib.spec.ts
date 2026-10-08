import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 6.2 Biblioteca de Código: snippets with files, highlighting, related + back, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `devlib-${Date.now()}@example.com`;
const password = 'Devlib-Strong-Pass-1';

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
  await page.getByLabel('Nome').fill('Devlib Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'devlib');
});

test('snippets: create, files, highlighting, related with back, favourites, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/devlib');
  await expect(page.getByText('Nenhum snippet encontrado.')).toBeVisible();

  await page.getByRole('button', { name: 'Novo Snippet' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await expect(dialog.getByText('Indique um título.')).toBeVisible();
  await dialog.getByLabel('Título').fill('Função debounce');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByLabel('Nome do ficheiro')).toHaveValue('funcao-debounce.js');
  const code = page.getByLabel('funcao-debounce.js', { exact: true });
  await code.fill('export function debounce(fn, wait = 250) {\n  let t; // timer\n  return t;\n}');
  await expect(page.locator('.kh-dl-hl .kh-hl-k').first()).toHaveText('export');
  await expect(page.locator('.kh-dl-hl .kh-hl-c')).toHaveText('// timer');
  await expect(page.locator('.kh-dl-gutter')).toHaveText('1\n2\n3\n4');
  await page.getByRole('button', { name: 'Adicionar ficheiro' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByLabel('Linguagem').selectOption('typescript');
  await expect(page.getByLabel('Nome do ficheiro')).toHaveValue('file2.ts');
  await page.getByRole('button', { name: 'Favorito', exact: true }).click();
  const tags = page.getByRole('combobox', { name: 'Tags' });
  await tags.fill('utils');
  await tags.press('Enter');
  await tags.fill('async');
  await tags.press('Enter');
  await expect(page.locator('.kh-dl-tag')).toHaveText(['utils×', 'async×']);

  await page.getByRole('button', { name: 'Novo Snippet' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título').fill('Top N por grupo');
  await dialog.getByLabel('Linguagem').selectOption('sql');
  await dialog.getByLabel('Tipo').selectOption('query');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  // the tags already used are suggested
  await expect(page.locator('.kh-dl-title')).toHaveValue('Top N por grupo');
  await page.getByRole('combobox', { name: 'Tags' }).fill('UT');
  await page.getByRole('option', { name: 'utils' }).click();
  await expect(page.locator('.kh-dl-tag')).toHaveText(['utils×']);
  await page.getByLabel('+ Relacionar snippet').selectOption({ label: 'Função debounce · JavaScript' });
  await page.locator('.kh-dl-rel').getByRole('button', { name: 'Função debounce', exact: true }).click();
  await expect(page.getByLabel('Nome do ficheiro')).toHaveValue('funcao-debounce.js');
  await page.getByRole('button', { name: 'Top N por grupo' }).first().click();
  await expect(page.locator('.kh-dl-title')).toHaveValue('Top N por grupo');

  await page.waitForTimeout(800); // debounced saves
  await page.reload();
  await expect(page.locator('.kh-dl-ghead')).toHaveCount(2); // JavaScript, SQL
  await page.locator('.kh-dl-chips button', { hasText: 'Favoritos' }).click();
  await expect(page.locator('.kh-dl-item')).toHaveCount(1);
  await page.locator('.kh-dl-item').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.kh-dl-tag')).toHaveText(['utils×', 'async×']);
  await expect(page.locator('.kh-dl-rel')).toContainText('Top N por grupo');

  await page.getByRole('button', { name: 'Eliminar snippet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto('app/trash');
  await expect(page.getByText('Função debounce')).toBeVisible();
});
