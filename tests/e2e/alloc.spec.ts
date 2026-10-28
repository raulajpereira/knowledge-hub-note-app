import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Alocações v2: create by dragging on the timeline (the linked h/dia · % ·
// total fields), resize and move by dragging, Alt+drag copies, Ctrl+Z undoes,
// Shift+drag marks an absence; the grid spreads a typed week and distributes
// over a selection; Projetos assigns a person to a role "Por atribuir" by
// dragging; Capacidade shows the SAP areas.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `alloc-${Date.now()}@example.com`;
const password = 'Alloc-Strong-Pass-1';
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
  const code = /KH-LIC-\d{6}/.exec(cli('codes:create', '--type', 'license', '--plan', 'MANAGEMENT'))![0];
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.141' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Gestora Alocações');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await login(page);
  // the demo data ("Repor Dados")
  expect((await page.request.post('api/v1/mg/sample')).ok()).toBe(true);
  await page.close();
});

type Bk = {
  id: string;
  person: string;
  project: string;
  role: string;
  status: string;
  from: string;
  to: string;
  mode: string;
  value: number;
  mask: number;
  days: Record<string, number>;
};
type Ab = { id: string; person: string; type: string; from: string; to: string };
type Person = { id: string; name: string; status: string };
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s: string, k: number) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + k);
  return iso(d);
};
const range = async (page: Page, from = addD(iso(new Date()), -200), to = addD(iso(new Date()), 400)) =>
  (await (await page.request.get(`api/v1/mg/alloc?from=${from}&to=${to}`)).json()) as {
    bookings: Bk[];
    absences: Ab[];
  };
const people = async (page: Page) =>
  ((await (await page.request.get('api/v1/mg')).json()) as { people: Person[] }).people;
/** Someone with nothing booked over the next 6 weeks. */
async function freePerson(page: Page) {
  const r = await range(page);
  const t = iso(new Date());
  const busy = new Set(r.bookings.filter((b) => b.to >= t && b.from <= addD(t, 42)).map((b) => b.person));
  return (await people(page)).find((p) => p.status === 'Ativo' && !busy.has(p.id))!;
}
/** The x of a day on the timeline (the middle of its header column). */
async function dayX(page: Page, day: string) {
  const b = (await page.locator(`.al-hcol[data-day="${day}"]`).boundingBox())!;
  return b.x + b.width / 2;
}
const nextMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return iso(d);
};

test('timeline: drag to create with the linked fields, resize, move, Alt+drag copy, undo, absence', async ({
  page,
}) => {
  await login(page);
  const p = await freePerson(page);
  await page.goto('app/mg-alloc?v=tl');
  await page.getByRole('button', { name: 'Dias', exact: true }).click();
  await page.getByLabel('Pesquisar pessoa, projeto…').fill(p.name);
  const row = page.locator(`.al-row[data-row="${p.id}"]`);
  await expect(row).toBeVisible();
  const mon = nextMonday();
  // bring next Monday into view
  await page.locator('[data-al-scroll]').evaluate((e) => (e.scrollLeft -= 0));
  const y = (await row.boundingBox())!.y + 20;
  const x0 = await dayX(page, mon);
  const x1 = await dayX(page, addD(mon, 4));
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1, y, { steps: 10 });
  await page.mouse.up();
  const pop = page.getByRole('dialog', { name: 'Nova alocação' });
  await expect(pop).toBeVisible();
  const dm = (x: string) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  await expect(pop.getByLabel('De', { exact: true })).toHaveValue(dm(mon));
  await expect(pop.getByLabel('Até', { exact: true })).toHaveValue(dm(addD(mon, 4)));
  // typing 75 % gives 6 h a day and 30 h in total (5 working days, 8 h capacity)
  await pop.getByLabel('% capacidade').click();
  await pop.getByLabel('% capacidade').fill('75');
  await expect(pop.getByLabel('Horas/dia')).toHaveValue('6');
  await expect(pop.getByLabel('Total')).toHaveValue('30');
  await expect(pop.getByLabel('FTE')).toHaveValue('0,75');
  // and the total back to h/dia
  await pop.getByLabel('Total').click();
  await pop.getByLabel('Total').fill('20');
  await expect(pop.getByLabel('Horas/dia')).toHaveValue('4');
  await pop.getByLabel('Função').fill('Teste E2E');
  await pop.getByRole('button', { name: 'Criar alocação' }).click();
  await expect(pop).toBeHidden();
  const mine = async () => (await range(page)).bookings.filter((b) => b.person === p.id);
  await expect.poll(async () => (await mine()).length).toBe(1);
  const b0 = (await mine())[0]!;
  expect(b0).toMatchObject({ from: mon, to: addD(mon, 4), mode: 'total', value: 20, role: 'Teste E2E' });

  // resize by the right edge: two more days (the weekend is in the range, not in the mask)
  const bar = page.locator(`[data-item="${b0.id}"]`);
  await expect(bar).toBeVisible();
  const bb = (await bar.boundingBox())!;
  await page.mouse.move(bb.x + bb.width - 3, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width - 3 + 34 * 3, bb.y + bb.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await mine())[0]?.to).toBe(addD(mon, 7));

  // move a week later
  const bb2 = (await bar.boundingBox())!;
  await page.mouse.move(bb2.x + 30, bb2.y + bb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb2.x + 30 + 34 * 7, bb2.y + bb2.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await mine())[0]?.from).toBe(addD(mon, 7));

  // Alt+drag copies; Ctrl+Z takes the copy back
  const bb3 = (await bar.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(bb3.x + 30, bb3.y + bb3.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb3.x + 30 + 34 * 7, bb3.y + bb3.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await mine()).length).toBe(2);
  await page.locator('.al-well').first().focus();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await mine()).length).toBe(1);

  // Shift+drag on the row marks an absence
  const y2 = (await row.boundingBox())!.y + (await row.boundingBox())!.height - 8;
  const a0 = await dayX(page, addD(mon, 1));
  const a1 = await dayX(page, addD(mon, 3));
  await page.keyboard.down('Shift');
  await page.mouse.move(a0, y2);
  await page.mouse.down();
  await page.mouse.move(a1, y2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const ab = page.getByRole('dialog', { name: 'Marcar ausência' });
  await expect(ab).toBeVisible();
  await ab.getByRole('button', { name: 'Formação' }).click();
  await ab.getByRole('button', { name: 'Marcar', exact: true }).click();
  await expect
    .poll(async () =>
      (await range(page)).absences.filter((a) => a.person === p.id).map((a) => [a.type, a.from, a.to]),
    )
    .toEqual([['formacao', addD(mon, 1), addD(mon, 3)]]);
  await expect(row.locator('.al-bar.abs')).toHaveCount(1);
});

test('popover: over-allocation is a warning with one-click fixes', async ({ page }) => {
  await login(page);
  const r = await range(page);
  const t = iso(new Date());
  // someone fully booked now
  const all = await people(page);
  const b = r.bookings.find(
    (x) =>
      x.person &&
      x.status === 'confirmed' &&
      x.mode === 'hpd' &&
      x.value >= 6 &&
      x.from <= t &&
      x.to >= addD(t, 20),
  )!;
  const who = all.find((x) => x.id === b.person)!;
  await page.goto('app/mg-alloc?v=tl');
  await page.getByRole('button', { name: '+ Alocação' }).click();
  const pop = page.getByRole('dialog', { name: 'Nova alocação' });
  await pop.getByLabel('Pessoa').selectOption({ label: who.name });
  await pop.getByLabel('Horas/dia').fill('6');
  await expect(pop.getByRole('alert')).toContainText('Sobre-alocação');
  await pop.getByRole('alert').getByRole('button', { name: 'tentativo', exact: true }).click();
  await expect(pop.getByRole('alert')).toHaveCount(0);
  await pop.getByRole('button', { name: 'Cancelar' }).click();
});

test('grid: a week typed is spread over the working days; a selection distributes', async ({ page }) => {
  await login(page);
  const r = await range(page);
  const t = iso(new Date());
  const all = await people(page);
  const b = r.bookings.find(
    (x) => x.person && x.status === 'confirmed' && x.from <= t && x.to >= addD(t, 40),
  )!;
  const who = all.find((x) => x.id === b.person)!;
  await page.goto('app/mg-alloc?v=grid');
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await page.getByRole('button', { name: 'Horas', exact: true }).click();
  await page.getByLabel('Pesquisar pessoa, projeto…').fill(who.name);
  await page.getByRole('button', { name: `Abrir ${who.name}` }).click();
  const code = (
    (await (await page.request.get('api/v1/mg')).json()) as { projects: Array<{ id: string; code: string }> }
  ).projects.find((x) => x.id === b.project)!.code;
  const sub = page.locator(`[data-sub="${who.id}|${code}"]`).first();
  await expect(sub).toBeVisible();
  // the second visible week of the row (cells are addressed by row:column)
  const cells = sub.locator('[role="gridcell"]');
  const [r0, c0] = (await cells.nth(3).getAttribute('data-cell'))!.split(':').map(Number) as [number, number];
  const cell = (k: number) => page.locator(`[data-cell="${r0}:${c0 + k}"]`);
  const c = cell(0);
  await c.click();
  await page.keyboard.type('13');
  await page.keyboard.press('Enter');
  const bk = async () =>
    (await range(page)).bookings.find(
      (x) => x.person === who.id && x.project === b.project && x.from === b.from,
    )!;
  await expect.poll(async () => Object.keys((await bk()).days).length).toBeGreaterThan(0);
  await expect(c).toContainText('13');
  // three weeks selected, 30 distributed over the period
  await c.click();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('toolbar', { name: 'Seleção' })).toContainText('3 células');
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  const how = page.getByRole('dialog', { name: 'Como aplicar' });
  await expect(how).toBeVisible();
  await how.getByText(/Distribuir 30h no período/).click();
  await how.getByRole('button', { name: /Aplicar/ }).click();
  // 30 h over the three weeks (by capacity: a holiday week gets less)
  const num = async (k: number) =>
    Number(((await cell(k).textContent()) ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  await expect.poll(async () => (await num(0)) + (await num(1)) + (await num(2))).toBe(30);
  // a typed cell is marked
  await expect(c.locator('.man')).toHaveCount(1);
});

test('projects: drag a person from "Quem pode ir?" onto a role "Por atribuir"', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-alloc?v=proj');
  const ph = page
    .locator('.al-row[data-role-row]')
    .filter({ has: page.locator('.al-ph-av') })
    .first();
  await expect(ph).toBeVisible();
  const id = await ph.getAttribute('data-role-row');
  await ph.locator('.al-name').click();
  const cand = page.locator('.al-cand').first();
  await expect(cand).toBeVisible();
  const pid = await cand.getAttribute('data-cand');
  const from = (await cand.boundingBox())!;
  // onto the role's row (its name cell is always in view)
  const to = (await ph.locator('.al-name').boundingBox())!;
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  const drop = page.getByRole('dialog', { name: 'Largar na função' });
  await expect(drop).toBeVisible();
  await expect(drop).toContainText('Custo');
  await drop.getByRole('button', { name: /Largar/ }).click();
  await expect.poll(async () => (await range(page)).bookings.find((b) => b.id === id)?.person).toBe(pid);
});

test('capacity: SAP areas over 12 months and what is still to decide', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-alloc?v=cap');
  await expect(page.locator('[data-area="FI / CO"]')).toBeVisible();
  await expect(page.locator('[data-area="FI / CO"] .al-cap-cell')).toHaveCount(12);
  await expect(page.getByRole('complementary', { name: 'O que falta decidir' })).toBeVisible();
});
