import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 5.2 Emails: .eml / .msg import parsed on the server, sandboxed
// body, folders, star, create task, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `emails-${Date.now()}@example.com`;
const password = 'Emails-Strong-Pass-1';

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
  await page.getByLabel('Nome').fill('Emails Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'emails');
});

test('import .eml and .msg, read the sanitized body, star, folder, task, Trash', async ({ page }) => {
  test.setTimeout(60_000); // three uploads parsed on the server
  await login(page);
  await page.goto('app/emails');
  await expect(page.getByText('Sem emails. Importe ficheiros .msg ou .eml')).toBeVisible();
  const { EML } = await import('../fixtures/sample-eml');
  await page.getByLabel('Importar .msg / .eml').setInputFiles([
    { name: 'cutover.eml', mimeType: 'message/rfc822', buffer: Buffer.from(EML) },
    {
      name: 'plano.msg',
      mimeType: 'application/vnd.ms-outlook',
      buffer: fs.readFileSync('tests/fixtures/sample.msg'),
    },
    { name: 'lixo.eml', mimeType: 'message/rfc822', buffer: Buffer.from([1, 2, 3]) },
  ]);
  await expect(page.locator('.kh-em-msg')).toContainText('2 email(s) importado(s).');
  await expect(page.locator('.kh-em-msg')).toContainText('lixo.eml');
  await expect(page.locator('.kh-em-item')).toHaveCount(2);

  await page.locator('.kh-em-item', { hasText: 'Plano de cutover — S/4HANA' }).click();
  await expect(page.getByRole('heading', { name: 'Plano de cutover — S/4HANA' })).toBeVisible();
  await expect(page.locator('.kh-em-meta')).toContainText('Ana Silva <ana.silva@cliente.pt>');
  const frame = page.frameLocator('iframe.kh-em-frame');
  await expect(frame.locator('b')).toHaveText('Raul');
  await expect(frame.locator('script')).toHaveCount(0);
  await expect(page.locator('.kh-em-att')).toContainText('plano.pdf');

  await page.getByRole('button', { name: 'Marcar como Importante' }).click();
  await page.getByPlaceholder('Nome da pasta').fill('Banco SOL');
  await page.getByRole('button', { name: '+ Nova Pasta' }).click();
  await page.locator('.kh-em-select').selectOption({ label: 'Banco SOL' });
  await page.getByRole('button', { name: 'Criar Tarefa a partir do Email' }).click();
  await expect(page.locator('.kh-em-msg')).toContainText('Tarefa criada: Plano de cutover');
  await page.getByRole('button', { name: 'Importantes' }).click();
  await expect(page.locator('.kh-em-item')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.kh-em-folder', { hasText: 'Banco SOL' })).toContainText('1');
  await page.locator('.kh-em-folder', { hasText: 'Todos os Emails' }).click();
  await page.locator('.kh-em-filters button').first().click();

  await page.locator('.kh-em-item', { hasText: 'SAP S/4HANA' }).click();
  await expect(page.locator('.kh-em-meta')).toContainText('Raul Pereira <raul@example.pt>');
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-em-item')).toHaveCount(1);
  await page.goto('app/trash');
  await expect(page.getByText('Plano de cutover — SAP S/4HANA')).toBeVisible();

  await page.goto('app/tasks');
  await expect(page.getByText('Plano de cutover — S/4HANA')).toBeVisible();
});
