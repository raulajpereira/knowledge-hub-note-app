import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 6.4 Quadro: drawing, text, undo, app items + popup, save + reload, conflict, boards, image, Trash.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `wb-${Date.now()}@example.com`;
const password = 'Board-Strong-Pass-1';

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
  // Registration is limited to 10 per hour and IP and the other specs already
  // use them all; this one registers from its own (documentation) address.
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.64' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Board Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('boards: draw, write, undo, app item popup, save, conflict, several boards, image, Trash', async ({
  page,
}) => {
  await login(page);
  const origin = { origin: new URL(page.url()).origin };
  const api = (p: string) => `api/v1/${p}`;
  const { note } = await (
    await page.request.post(api('notes'), { data: { title: 'Nota do quadro' }, headers: origin })
  ).json();
  expect(note.id).toBeTruthy();

  await page.goto('app/whiteboard');
  const name = page.getByLabel('Nome do quadro');
  await expect(name).toHaveValue('Quadro sem título 1');
  await expect(page.getByText('Escolhe uma ferramenta à esquerda')).toBeVisible();
  const canvas = page.getByTestId('wb-canvas');
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;

  // rectangle: R, drag
  await page.keyboard.press('r');
  await page.mouse.move(...at(300, 300));
  await page.mouse.down();
  await page.mouse.move(...at(420, 360), { steps: 4 });
  await page.mouse.move(...at(500, 400), { steps: 4 });
  await page.mouse.up();
  const shapes = canvas.locator('g[data-id] > rect');
  await expect(shapes).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Preenchimento' })).toBeVisible(); // style bar for the selection
  await page.keyboard.press('Control+z');
  await expect(shapes).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(shapes).toHaveCount(1);

  // text by double-clicking the background, sticky note with S
  await page.mouse.dblclick(...at(650, 220));
  await expect(canvas.locator('[contenteditable]')).toBeFocused();
  await page.keyboard.type('Plano de migração');
  await page.keyboard.press('Control+Enter');
  await expect(canvas.getByText('Plano de migração')).toBeVisible();
  await page.keyboard.press('s');
  await page.mouse.click(...at(800, 400));
  await expect(canvas.locator('[contenteditable]')).toBeFocused();
  await page.keyboard.type('Rever FI/CO');
  await page.keyboard.press('Escape');
  await expect(canvas.getByText('Rever FI/CO')).toBeVisible();

  // an app item, opened in the popup without leaving the board
  await page.getByRole('button', { name: 'Elemento da app', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Adicionar elemento da app' });
  await dlg.getByLabel('Pesquisar notas, tarefas, código…').fill('Nota do quadro');
  await dlg.getByRole('button', { name: /Nota do quadro/ }).click();
  await page.getByRole('button', { name: 'Abrir Nota do quadro' }).click();
  const peek = page.getByRole('dialog', { name: 'Nota do quadro' });
  await expect(peek.getByRole('button', { name: /Abrir página/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peek).toHaveCount(0);

  await name.fill('Arquitetura');
  await name.press('Enter');
  await page.waitForTimeout(1200); // debounced save
  await page.reload();
  await expect(name).toHaveValue('Arquitetura');
  await expect(canvas.getByText('Plano de migração')).toBeVisible();
  await expect(canvas.getByText('Rever FI/CO')).toBeVisible();
  await expect(canvas.getByText('Nota do quadro')).toBeVisible();
  await expect(shapes).toHaveCount(1);

  // somebody else saves meanwhile (another tab): this tab is warned, not overwritten
  const { boards } = await (await page.request.get(api('whiteboards'))).json();
  const id = boards[0].id as string;
  await page.request.put(api(`whiteboards/${id}`), {
    data: { name: 'Remoto', force: true },
    headers: origin,
  });
  await page.keyboard.press('o');
  await page.mouse.click(...at(300, 550));
  await expect(page.getByRole('alert').filter({ hasText: 'alterado noutra janela' })).toBeVisible();
  await page.getByRole('button', { name: 'Carregar a versão guardada' }).click();
  await expect(name).toHaveValue('Remoto');
  await expect(canvas.locator('g[data-id] > ellipse')).toHaveCount(0);

  // a second board, an image on it, then switch back through the list
  await page.getByRole('button', { name: 'Novo quadro', exact: true }).first().click();
  await expect(name).toHaveValue('Quadro sem título 2');
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'ecra.png', mimeType: 'image/png', buffer: PNG });
  await expect(canvas.locator('g[data-id] > image')).toHaveCount(1);
  await page.getByRole('button', { name: 'Quadros' }).click();
  const list = page.getByRole('dialog', { name: 'Quadros' });
  await expect(list.locator('.kh-wb-brow')).toHaveCount(2);
  await list.getByText('Remoto').click();
  await expect(name).toHaveValue('Remoto');

  await page.getByRole('button', { name: 'Quadros' }).click();
  await list.getByRole('button', { name: 'Eliminar Remoto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await expect(name).toHaveValue('Quadro sem título 2');
  await page.goto('app/trash');
  await expect(page.getByText('Remoto')).toBeVisible();
});
