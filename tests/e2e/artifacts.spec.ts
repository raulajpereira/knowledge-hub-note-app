import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 6.1 Artefactos: versions, sandboxed preview / new tab, folders, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `arts-${Date.now()}@example.com`;
const password = 'Arts-Strong-Pass-1';

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
  await page.getByLabel('Nome').fill('Arts Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const PROBE = `<!doctype html><html><body><h1 id="h">Painel SAP</h1><p id="r">a testar</p>
<script>
  let out = [];
  try { out.push('cookie:' + (document.cookie ? 'yes' : 'no')); } catch (e) { out.push('cookie:blocked'); }
  try { parent.document.title; out.push('parent:open'); } catch (e) { out.push('parent:blocked'); }
  try { localStorage.length; out.push('storage:open'); } catch (e) { out.push('storage:blocked'); }
  document.getElementById('r').textContent = out.join(' ');
</script></body></html>`;

test('create, edit the HTML as versions, isolated preview, history, new tab, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/artifacts');
  await expect(page.getByText('Sem artefactos.')).toBeVisible();
  await page.getByRole('button', { name: 'Novo Artefacto' }).click();
  await page.getByLabel('Título').fill('Painel de KPIs');
  await page.getByLabel('Descrição').fill('Indicadores do go-live');
  await page.getByLabel('Etiqueta').fill('SAP');
  await page.keyboard.press('Enter');
  await expect(page.locator('.kh-ar-item')).toContainText('Painel de KPIs');
  await expect(page.frameLocator('iframe.kh-ar-frame').locator('h1')).toHaveText('Novo Artefacto');

  await page.getByRole('radio', { name: 'Código' }).click();
  await page.getByLabel('Código', { exact: true }).fill(PROBE);
  await page.getByRole('button', { name: 'Guardar Versão' }).click();
  await expect(page.getByRole('button', { name: 'Guardar Versão' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Pré-visualizar' }).click();
  const frame = page.frameLocator('iframe.kh-ar-frame');
  await expect(frame.locator('h1')).toHaveText('Painel SAP');
  // the artifact's scripts run, but with an opaque origin: no cookies, no parent, no storage
  await expect(frame.locator('#r')).toHaveText('cookie:blocked parent:blocked storage:blocked');

  await page.getByRole('button', { name: 'Histórico de Versões' }).click();
  const hist = page.getByRole('dialog', { name: 'Histórico de Versões' });
  await expect(hist.locator('.kh-ar-hist__row')).toHaveCount(2);
  await hist.getByRole('button', { name: 'Repor' }).click();
  await expect(frame.locator('h1')).toHaveText('Novo Artefacto');

  // "Abrir num Novo Separador" is served with CSP: sandbox (opaque origin)
  const id = new URL(page.url()).searchParams.get('a')!;
  const res = await page.request.get(`api/v1/artifacts/${id}/view`);
  expect(res.headers()['content-security-policy']).toContain('sandbox');
  expect(res.headers()['content-security-policy']).not.toContain('allow-same-origin');
  // with the app's scrollbars (shown only while scrolling), closed before the page itself
  const viewed = await res.text();
  expect(viewed).toMatch(/<style data-kh-scrollbars>[^<]*<\/style><script data-kh-scrollbars>/);

  // left in Código, an artifact always opens again in Pré-visualizar
  await page.getByRole('radio', { name: 'Código' }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Pré-visualizar' })).toBeChecked();
  await expect(page.locator('.kh-ar-tag')).toContainText('SAP');
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.getByText('Sem artefactos.')).toBeVisible();
  await page.goto('app/trash');
  await expect(page.getByText('Painel de KPIs')).toBeVisible();
});
