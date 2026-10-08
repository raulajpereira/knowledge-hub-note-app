import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Assistente IA: own key in Definições, a conversation with sources, "Organizar com IA" in a meeting record.
// Runs against the local fake provider (AI_TEST_BASE_URL → tests/stubs/fakeAi.mjs).
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');
test.skip(
  !process.env.AI_TEST_BASE_URL && !process.env.E2E_AI,
  'needs the fake AI provider (AI_TEST_BASE_URL)',
);

const email = `ai-${Date.now()}@example.com`;
const password = 'Ai-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.142' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Ai Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

test('set up a key, ask with sources, organise a meeting record', async ({ page }) => {
  await login(page);
  // without a key the panel points to Definições
  await page.getByRole('button', { name: 'Assistente IA' }).click();
  await expect(page.getByText('configure o seu fornecedor de IA')).toBeVisible();
  await page.getByRole('link', { name: 'Abrir Definições › Assistente IA' }).click();
  await expect(page.getByText('Use o seu próprio fornecedor de IA')).toBeVisible();

  await page.getByLabel('Fornecedor').selectOption('groq');
  await page.getByLabel('Chave de API').fill('gsk_wrong_key');
  await page.getByRole('button', { name: 'Testar e carregar modelos' }).click();
  await expect(page.locator('.kh-ai-err')).toContainText('A chave foi recusada');
  await page.getByLabel('Chave de API').fill('test-key-e2e-9876');
  await page.getByRole('button', { name: 'Testar e carregar modelos' }).click();
  await expect(page.getByLabel('Modelo')).toHaveValue('fake-chat-1');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Em uso: Groq · fake-chat-1')).toBeVisible();
  // the key is never sent back
  const st = await (await page.request.get('api/v1/ai/settings')).json();
  expect(JSON.stringify(st)).not.toContain('test-key-e2e');
  expect(st.ai).toMatchObject({ keyHint: '9876', model: 'fake-chat-1', audio: true });

  // something to find
  await page.request.post('api/v1/notes', { data: { title: 'Decisões payroll Banco SOL' } });

  await page.getByRole('button', { name: 'Assistente IA' }).click();
  const panel = page.getByRole('dialog', { name: 'Assistente IA' });
  await panel.getByLabel(/Pergunte ao assistente/).fill('O que decidimos sobre o payroll?');
  await panel.getByLabel(/Pergunte ao assistente/).press('Enter');
  await expect(panel.locator('.kh-ai__msg[data-role="assistant"]')).toContainText(
    'Resposta de teste com 1 fontes',
  );
  await expect(panel.locator('.kh-ai__srcs a')).toHaveText(['1 Decisões payroll Banco SOL']);
  await expect(panel.locator('.kh-ai-cite')).toHaveText('1');
  // kept in the history
  await panel.getByRole('button', { name: 'Conversas anteriores' }).click();
  await expect(panel.locator('.kh-ai__chat')).toContainText('O que decidimos sobre o payroll?');
  await panel.getByRole('button', { name: 'Fechar' }).click();

  // a meeting record: notes → summary, points to review, actions
  await page.goto('app/meetings');
  await page.getByRole('button', { name: 'Novo Registo' }).click();
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  await page.getByLabel('Temas discutidos').fill('falámos do âmbito da fase 2, rubricas e plano de testes');
  await page.getByRole('button', { name: 'Organizar com IA' }).click();
  const sug = page.getByLabel('Sugestão da IA');
  await expect(sug).toContainText('Resumo de teste');
  await sug.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByLabel('Pontos a rever 1')).toHaveValue('Validar mapeamento de rubricas');
  await expect(page.getByLabel('Coisas a fazer 1')).toHaveValue('Pedro — preparar plano de testes');
  await expect(page.getByLabel('Temas discutidos')).toHaveValue(
    /^Resumo de teste[\s\S]*notas originais[\s\S]*fase 2/,
  );
});
