import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Registos Reuniões: records with participants, topics (with an image), checklists, a task from a
// to-do, a link to another record, Calendar, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `meetings-${Date.now()}@example.com`;
const password = 'Meetings-Strong-Pass-1';

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
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.141' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Meetings Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
  cli('tenants:module', '--email', email, '--add', 'meetings');
});

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('write a record, a task from a to-do, on the Calendar, Trash', async ({ page }) => {
  await login(page);
  await page.goto('app/meetings');
  await expect(page.getByRole('link', { name: 'Registos Reuniões' })).toBeVisible();
  await expect(page.getByText('Ainda sem registos. Crie o primeiro com +.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Novo Registo' }).click();
  // the new record is created on the server first: write once it is open
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  await page.getByLabel('Tema da reunião').fill('Kick-off Atlas');
  await page.getByLabel('Data', { exact: true }).fill(isoToday());
  await page.getByLabel('Início', { exact: true }).fill('09:30');
  await page.getByLabel('Fim', { exact: true }).fill('10:30');

  // participants: free names (also outside the app), Enter or comma adds
  const who = page.getByLabel('Adicionar nome e Enter (podem ser externos)');
  await who.fill('Bia Santos');
  await who.press('Enter');
  await who.fill('Luís Costa (cliente), Pedro Almeida');
  await who.press('Enter');
  await expect(page.locator('.kh-mt-chip')).toHaveText([
    'Bia Santos',
    'Luís Costa (cliente)',
    'Pedro Almeida',
  ]);
  await page.getByRole('button', { name: 'Eliminar Pedro Almeida' }).click();

  await page.getByLabel('Temas discutidos').fill('Âmbito da fase 2 e calendário do go-live.');
  // the topics are the Notes editor: an image is stored with the record
  await page
    .getByRole('toolbar', { name: 'Formatação dos temas' })
    .getByRole('button', { name: 'Imagem' })
    .click();
  await page.locator('.kh-mt-doc input[type=file]').setInputFiles({
    name: 'quadro.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.locator('.kh-mt-doc img[src*="/api/v1/meetings/files/"]')).toHaveCount(1);
  // an image of the app copied with "Copy image" arrives as its full address: stored again, not refused
  await page.locator('.kh-mt-doc .ProseMirror p').first().click();
  await page.keyboard.press('End');
  await page.locator('.kh-mt-doc .ProseMirror').evaluate((el) => {
    const src = el.querySelector('img')!.src;
    const dt = new DataTransfer();
    dt.setData('text/html', `<!--StartFragment--><img src="${src}"/><!--EndFragment-->`);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.kh-mt-doc img[src*="/api/v1/meetings/files/"]')).toHaveCount(2);
  await page.getByRole('button', { name: '+ Ponto' }).click();
  await page.getByLabel('Pontos a rever 1').fill('Validar rubricas');
  await page.getByRole('button', { name: '+ Ação' }).click();
  await page.getByLabel('Coisas a fazer 1').fill('Preparar plano de testes');
  await page.getByLabel('Coisas a fazer 1').press('Enter');
  await page.getByLabel('Coisas a fazer 2').fill('Enviar ata ao cliente');
  await page.getByRole('button', { name: 'Feito: Enviar ata ao cliente' }).click();
  await expect(page.getByText('1/2')).toBeVisible();

  // a to-do becomes a task linked to the meeting
  await page
    .getByRole('button', { name: 'Criar tarefa ligada a esta reunião: Preparar plano de testes' })
    .click();
  await expect(page.getByText('Tarefa criada e ligada à reunião.')).toBeVisible();
  await expect(page.locator('.kh-cx__link', { hasText: 'Preparar plano de testes' })).toBeVisible();

  await page.waitForTimeout(800); // debounced saves
  await page.reload();
  await expect(page.locator('.kh-mt-item', { hasText: 'Kick-off Atlas' })).toContainText(
    '09:30–10:30 · 2 pessoas',
  );
  await expect(page.getByLabel('Temas discutidos')).toHaveText('Âmbito da fase 2 e calendário do go-live.');
  await expect(page.locator('.kh-mt-doc img[src*="/api/v1/meetings/files/"]')).toHaveCount(2);
  await expect(page.getByLabel('Coisas a fazer 2')).toHaveValue('Enviar ata ao cliente');

  // on the Calendar, on its day, with the time
  await page.goto('app/calendar');
  await expect(page.locator('.kh-cal__item', { hasText: '09:30 Kick-off Atlas' }).first()).toBeVisible();
  await page.locator('.kh-cal__item', { hasText: '09:30 Kick-off Atlas' }).first().click();
  await expect(page).toHaveURL(/app\/meetings\?m=/);

  // folders: create one, a new record goes in the folder that is open, move with the selector
  await page.getByLabel('Nome da pasta').fill('Projeto Atlas');
  await page.getByRole('button', { name: '+ Nova Pasta' }).click();
  const atlas = page.locator('.kh-em-folder', { hasText: 'Projeto Atlas' });
  await expect(atlas).toHaveAttribute('data-on', 'true');
  await expect(page.locator('.kh-mt-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Novo Registo' }).click();
  // the new record is created on the server first: write once it is open
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  await page.getByLabel('Tema da reunião').fill('Workshop Payroll');
  await expect(page.getByLabel('Pasta', { exact: true })).toHaveValue(/.+/);
  await expect(atlas.locator('.kh-em-count')).toHaveText('1');
  // a link to another meeting record (never itself), shown in both
  await page.getByLabel('Pesquisar itens para ligar…').fill('Kick-off');
  await page.getByRole('option', { name: /Kick-off Atlas/ }).click();
  await expect(page.locator('.kh-cx__link', { hasText: 'Kick-off Atlas' })).toBeVisible();
  await page.locator('.kh-em-folder', { hasText: 'Todos os registos' }).click();
  await expect(page.locator('.kh-mt-item')).toHaveCount(2);
  await page.locator('.kh-mt-item', { hasText: 'Kick-off Atlas' }).click();
  await expect(page.locator('.kh-cx__link', { hasText: 'Workshop Payroll' })).toBeVisible();
  await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'Projeto Atlas' });
  await expect(atlas.locator('.kh-em-count')).toHaveText('2');
  // deleting the folder keeps its records
  await page.getByRole('button', { name: 'Eliminar Projeto Atlas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(atlas).toHaveCount(0);
  await expect(page.locator('.kh-mt-item')).toHaveCount(2);
  await page.locator('.kh-mt-item', { hasText: 'Workshop Payroll' }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.locator('.kh-mt-item', { hasText: 'Kick-off Atlas' }).click();

  // delete → Trash
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(page.locator('.kh-mt-item')).toHaveCount(0);
  await page.goto('app/trash');
  await expect(page.getByText('Kick-off Atlas')).toBeVisible();
});

test('leaving a record offers its open to-dos as tasks, of the chosen type', async ({ page }) => {
  await login(page);
  await page.goto('app/meetings');
  await page.getByRole('button', { name: 'Novo Registo' }).click();
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  await page.getByLabel('Tema da reunião').fill('Retro sprint 12');
  await page.getByRole('button', { name: '+ Ação' }).click();
  await page.getByLabel('Coisas a fazer 1').fill('Atualizar documentação');
  await page.getByLabel('Coisas a fazer 1').press('Enter');
  await page.getByLabel('Coisas a fazer 2').fill('Rever orçamento');
  await page.getByLabel('Coisas a fazer 2').press('Enter');
  await page.getByLabel('Coisas a fazer 3').fill('Fechar ata');
  await page.getByRole('button', { name: 'Feito: Fechar ata' }).click();

  // a new record: first the question about this one's to-dos (the done one is not offered)
  await page.getByRole('button', { name: 'Novo Registo' }).click();
  const ask = page.getByRole('dialog', { name: 'Criar tarefas para as coisas a fazer?' });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('checkbox')).toHaveText(['Atualizar documentação', 'Rever orçamento']);
  await expect(ask.getByRole('checkbox', { name: 'Atualizar documentação' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await ask.getByRole('checkbox', { name: 'Rever orçamento' }).click();
  await ask.getByRole('radio', { name: 'Gestão' }).click();
  await ask.getByRole('button', { name: 'Criar tarefas (1)' }).click();
  await expect(page.getByText('Tarefa criada e ligada à reunião.')).toBeVisible();
  await expect(ask).toBeHidden();
  // …then the navigation goes on
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  const tasks = (await (await page.request.get('api/v1/tasks')).json()) as {
    tasks: Array<{ title: string; type: string }>;
  };
  expect(tasks.tasks.find((x) => x.title === 'Atualizar documentação')?.type).toBe('mgmt');
  expect(tasks.tasks.some((x) => x.title === 'Rever orçamento')).toBe(false);

  // back on the record: the task is linked; the declined to-do is not asked again
  await page.locator('.kh-mt-item', { hasText: 'Retro sprint 12' }).click();
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Retro sprint 12');
  await expect(page.locator('.kh-cx__link', { hasText: 'Atualizar documentação' })).toBeVisible();
  await page.locator('.kh-mt-item', { hasText: 'Nova reunião' }).click();
  await expect(page.getByLabel('Tema da reunião')).toHaveValue('Nova reunião');
  await expect(ask).toBeHidden();

  // another page of the app waits for the answer too; "Agora não" goes on without tasks
  await page.locator('.kh-mt-item', { hasText: 'Retro sprint 12' }).click();
  await page.getByRole('button', { name: '+ Ação' }).click();
  await page.getByLabel('Coisas a fazer 4').fill('Marcar workshop');
  await page.getByRole('link', { name: /^Tarefas\s*\d*$/ }).click();
  await expect(ask).toBeVisible();
  await expect(ask.getByRole('checkbox')).toHaveText(['Marcar workshop']);
  await expect(page).toHaveURL(/app\/meetings/);
  await ask.getByRole('button', { name: 'Agora não' }).click();
  await expect(page).toHaveURL(/app\/tasks/);
  await expect(page.getByText('Atualizar documentação').first()).toBeVisible();
});
