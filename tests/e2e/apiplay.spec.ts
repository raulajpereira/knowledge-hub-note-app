import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 6.3 API Playground: requests, params, env variables, blocked proxy, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `api-${Date.now()}@example.com`;
const password = 'Api-Strong-Pass-1';

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
  await page.getByLabel('Nome').fill('Api Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'api');
});

test('requests: create, edit URL and params, env variables, blocked proxy, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/api');
  await expect(page.getByText('Sem pedidos.')).toBeVisible();

  await page.getByRole('button', { name: 'Novo Pedido' }).click();
  const url = page.getByLabel('URL', { exact: true });
  await expect(url).toHaveValue('{{host}}/');
  await page.locator('.kh-ap-title').fill('Utilizadores');
  await page.getByLabel('Método').selectOption('POST');

  // the query string becomes params, and the params tab counts them
  await url.fill('http://127.0.0.1:3100/v2/api/health?top=5&skip=0');
  await expect(page.getByRole('tab', { name: /Parâmetros/ })).toContainText('2');
  await expect(page.getByLabel('Valor top')).toHaveValue('5');
  await page.getByLabel('skip', { exact: true }).click(); // switch the param off
  await expect(url).toHaveValue('http://127.0.0.1:3100/v2/api/health?top=5');

  // the server proxy refuses private addresses and says why
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('tab', { name: /Resposta/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.kh-ap-error')).toContainText('Endereço bloqueado');

  // {{variables}} from the selected environment
  await page.getByRole('tab', { name: /Variáveis · DEV/ }).click();
  await page.getByLabel('Valor host').fill('https://api.example.com');
  await url.fill('{{host}}/odata/v2/User');
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ https://api.example.com/odata/v2/User');
  await page.getByRole('combobox', { name: 'Ambiente' }).selectOption('QAS');
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ /odata/v2/User');

  await page.waitForTimeout(900); // debounced saves
  await page.reload();
  await page.locator('.kh-ap-item', { hasText: 'Utilizadores' }).click();
  await expect(page.getByLabel('Método')).toHaveValue('POST');
  await expect(url).toHaveValue('{{host}}/odata/v2/User');
  await page.getByRole('combobox', { name: 'Ambiente' }).selectOption('DEV');
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ https://api.example.com/odata/v2/User');

  // x-www-form-urlencoded body: key / value rows, kept after reload
  await page.getByRole('tab', { name: /Corpo/ }).click();
  await page.locator('.kh-ap-btype').selectOption('form');
  await page.getByRole('button', { name: '+ Adicionar' }).click();
  await page.getByRole('textbox', { name: 'Chave', exact: true }).fill('grant_type');
  await page.getByLabel('Valor grant_type').fill('client_credentials');

  // each folder has its own environments, starting as copies of the global ones
  await page.getByLabel('Nome da pasta').fill('SuccessFactors');
  await page.getByRole('button', { name: '+ Nova Pasta' }).click();
  const row = page.locator('.kh-em-folder', { hasText: 'SuccessFactors' });
  const del = await row.getByRole('button', { name: 'Eliminar SuccessFactors' }).boundingBox();
  const box = await row.boundingBox();
  expect(box!.x + box!.width - (del!.x + del!.width)).toBeLessThan(60); // at the right, by the count
  await page.getByRole('button', { name: 'Todos os Pedidos' }).click();
  await page.locator('.kh-ap-item', { hasText: 'Utilizadores' }).click();
  await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'SuccessFactors' });
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ https://api.example.com/odata/v2/User');
  await page.getByRole('tab', { name: /Variáveis · DEV/ }).click();
  await expect(page.locator('.kh-ap-hint').first()).toContainText('Ambiente DEV · SuccessFactors');
  await page.getByLabel('Valor host').fill('https://sf.example.com');
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ https://sf.example.com/odata/v2/User');
  await page.getByRole('button', { name: 'Gerir ambientes' }).click();
  const mgr = page.getByRole('dialog', { name: 'Gerir ambientes' });
  await expect(mgr.getByRole('textbox', { name: /Nome do ambiente/ })).toHaveCount(3);
  await mgr.getByLabel('Novo ambiente (ex.: UAT)').fill('UAT');
  await mgr.getByLabel('Novo ambiente (ex.: UAT)').press('Enter');
  await expect(mgr.getByRole('textbox', { name: /Nome do ambiente/ })).toHaveCount(4);
  await mgr.getByRole('button', { name: 'Eliminar PRD' }).click();
  await page
    .getByRole('dialog', { name: 'Eliminar ambiente?' })
    .getByRole('button', { name: 'Eliminar' })
    .click();
  await expect(mgr.getByRole('textbox', { name: /Nome do ambiente/ })).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Ambiente' }).locator('option')).toHaveText([
    'DEV',
    'QAS',
    'UAT',
  ]);
  await expect(page.locator('.kh-ap-resolved')).toHaveText('→ /odata/v2/User'); // UAT, no host yet
  // back without a folder: the global environments again
  await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'Sem Pasta' });
  await expect(page.getByRole('combobox', { name: 'Ambiente' }).locator('option')).toHaveText([
    'DEV',
    'QAS',
    'PRD',
  ]);

  await page.waitForTimeout(900); // debounced saves
  await page.reload();
  await page.locator('.kh-ap-item', { hasText: 'Utilizadores' }).click();
  await page.getByRole('tab', { name: /Corpo/ }).click();
  await expect(page.getByLabel('Valor grant_type')).toHaveValue('client_credentials');

  await page.getByRole('button', { name: 'Duplicar' }).click();
  await expect(page.locator('.kh-ap-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-ap-item')).toHaveCount(1);
  await page.goto('app/trash');
  await expect(page.getByText('Utilizadores (2)')).toBeVisible();
});
