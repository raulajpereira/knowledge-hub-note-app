import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Files of Ficheiros in "Ligações": link an uploaded file from a note, a task
// and a meeting (own "Ficheiros" card), open it from the link, see "Ligado a"
// in Ficheiros and unlink from both sides.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `filelinks-${Date.now()}@example.com`;
const password = 'Filelinks-Pass-1';

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
  const page = await browser.newPage({
    locale: 'pt-PT',
    // own IP: the register limit (10/h per IP) is shared by every spec without one
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.193' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Files Tester');
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

test('link a file from a note, a task and a meeting; open it; "Ligado a"; unlink', async ({ page }) => {
  await login(page);
  await page.goto('app/files');
  await page.locator('.kh-fl-up input').setInputFiles({
    name: 'Caderno de encargos.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Requisitos do projeto Atlas\n'),
  });
  await expect(page.locator('.kh-fl-item:not(.kh-fl-item--up)')).toHaveCount(1, { timeout: 30_000 });
  const fileId = new URL(page.url()).searchParams.get('f')!;
  // nothing linked yet
  const linked = page.getByRole('group', { name: 'Ligado a' });
  await expect(linked).toContainText('Ainda não está ligado a notas, tarefas ou reuniões.');

  const post = async (url: string, data: object) => (await page.request.post(url, { data })).json();
  const { note } = await post('api/v1/notes', { title: 'Plano Atlas' });
  const { task } = await post('api/v1/tasks', { title: 'Rever caderno' });
  const { meeting } = await post('api/v1/meetings', { title: 'Kick-off Atlas', heldOn: '2026-10-20' });

  const linkFrom = async (url: string) => {
    await page.goto(url);
    const box = page.getByRole('group', { name: 'Ficheiros' });
    await expect(box).toContainText('Nenhum ficheiro ligado.');
    await box.getByPlaceholder('Pesquisar ficheiros para ligar…').fill('encargos');
    await box.locator('.kh-cx__results > div', { hasText: 'Caderno de encargos.txt' }).click();
    const chip = box.locator('.kh-cx__link', { hasText: 'Caderno de encargos.txt' });
    await expect(chip.locator('.kh-cx__ext')).toHaveText('txt');
    await expect(chip).toContainText('28 B');
    // the file is in its own card, not with the other links
    await expect(page.getByRole('group', { name: 'Ligações' })).not.toContainText('Caderno de encargos');
    return chip;
  };

  await linkFrom(`app/notes?n=${note.id}`);
  await linkFrom(`app/tasks?t=${task.id}`);
  const chip = await linkFrom(`app/meetings?m=${meeting.id}`);
  // after a reload it's still there
  await page.reload();
  await expect(chip).toBeVisible();

  // opening it goes to its preview in Ficheiros, which lists what it's linked to
  await chip.locator('.kh-cx__t').click();
  await page.waitForURL(new RegExp(`/app/files\\?f=${fileId}`));
  await expect(page.locator('.kh-fl-text')).toContainText('Requisitos do projeto Atlas');
  for (const t of ['Plano Atlas', 'Rever caderno', 'Kick-off Atlas'])
    await expect(linked.locator('.kh-cx__link', { hasText: t })).toBeVisible();

  // unlink the task from the file's side…
  await linked
    .locator('.kh-cx__link', { hasText: 'Rever caderno' })
    .getByRole('button', { name: 'Remover Ligação' })
    .click();
  await expect(linked.locator('.kh-cx__link')).toHaveCount(2);
  // …and the meeting from the meeting
  await page.goto(`app/meetings?m=${meeting.id}`);
  const mbox = page.getByRole('group', { name: 'Ficheiros' });
  await mbox.getByRole('button', { name: 'Remover Ligação' }).click();
  await expect(mbox).toContainText('Nenhum ficheiro ligado.');
  await page.goto(`app/tasks?t=${task.id}`);
  await expect(page.getByRole('group', { name: 'Ficheiros' })).toContainText('Nenhum ficheiro ligado.');

  // in the Trash the file leaves the links; restored, it's back
  await page.goto(`app/files?f=${fileId}`);
  await expect(linked.locator('.kh-cx__link')).toHaveCount(1);
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para o Lixo' }).click();
  await page.goto(`app/notes?n=${note.id}`);
  await expect(page.getByRole('group', { name: 'Ficheiros' })).toContainText('Nenhum ficheiro ligado.');
  const r = await page.request.post('api/v1/trash/restore', {
    data: { items: [{ kind: 'file', id: fileId }] },
  });
  expect(r.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Ficheiros' }).locator('.kh-cx__link', { hasText: 'Caderno' }),
  ).toBeVisible();
});
