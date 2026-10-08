import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase 8 Management: settings (areas, levels, sample data), clients, teams, people and skills.
test.use({ locale: 'pt-PT', viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

const outbox = process.env.MAIL_OUTBOX_DIR;
test.skip(!outbox, 'MAIL_OUTBOX_DIR is not set');

const email = `mg-${Date.now()}@example.com`;
const password = 'Mg-Strong-Pass-1';

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
  // Registration is limited to 10 per hour and IP and the other specs already
  // use them all; this one registers from its own (documentation) address.
  const page = await browser.newPage({
    locale: 'pt-PT',
    extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.97' },
  });
  await page.goto('register');
  await page.getByLabel('Nome').fill('Mg Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Licença').fill(code);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Conta criada')).toBeVisible();
  await page.goto(await verifyLink());
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.close();
});

type Mg = {
  projects: Array<{
    id: string;
    code: string;
    name: string;
    client: string;
    phases: Array<{ name: string }>;
  }>;
  allocs: Array<{
    id: string;
    person: string;
    project: string;
    hours: number;
    ovr?: Record<string, number | ''>;
    dov?: Record<string, number>;
    fn?: string;
  }>;
  reqs: Array<{ id: string; status: string; assigned: string; skills: Array<{ k: string; l: number }> }>;
  ts: Array<{ person: string; week: string; status: string; rows: Record<string, number[]> }>;
  teams: Array<{ id: string; name: string; desc: string }>;
  people: Array<{
    id: string;
    name: string;
    team: string;
    skills: Record<string, number>;
    status: string;
    statusNote: string;
    hired: string;
    expYears: number | '';
    expSplit: Array<{ area: string; years: number }>;
    phone: string;
  }>;
  clients: Array<{ name: string }>;
  settings: { levels?: string[] };
};
const mgData = async (page: Page) => (await (await page.request.get('api/v1/mg')).json()) as Mg;

test('settings: sample data, areas and levels', async ({ page }) => {
  await login(page);
  await page.goto('app/settings');
  await page.getByRole('tab', { name: 'Management' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Repor Dados' }).click();
  await expect(page.getByText('16 pessoas')).toBeVisible();
  await page.getByPlaceholder('Novo nível (ex.: Principal)').fill('Principal');
  await page.getByPlaceholder('Novo nível (ex.: Principal)').press('Enter');
  await expect(page.getByLabel('Níveis de Senioridade 5')).toHaveValue('Principal');
  await expect.poll(async () => (await mgData(page)).settings.levels?.at(-1)).toBe('Principal');
  const d = await mgData(page);
  expect(d.people).toHaveLength(38);
  expect(d.teams).toHaveLength(3);
});

test('teams: edit, add a new member, move a member', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-teams');
  await expect(page.getByRole('heading', { name: 'Equipas' })).toBeVisible();
  await page.getByText('Pessoas & PMO', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remover Equipa' })).toBeVisible();
  await page.getByLabel('Descrição').fill('Equipa de pessoas e PMO.');
  await page.getByRole('button', { name: 'Adicionar Membros' }).click();
  const dlg = page.getByRole('dialog', { name: 'Adicionar Membros' });
  await dlg.getByRole('tab', { name: 'Novo Colaborador' }).click();
  await dlg.getByRole('button', { name: 'Criar e Adicionar' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('Indique o nome do colaborador.');
  await dlg.getByLabel('Nome').fill('Zé Novo');
  await dlg.getByRole('button', { name: 'Criar e Adicionar' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remover da equipa: Zé Novo' })).toBeVisible();
  // move someone from another team
  await page.getByRole('button', { name: 'Adicionar Membros' }).click();
  await dlg.getByLabel('Pesquisar por nome, função ou área…').fill('Rui Martins');
  await dlg.getByRole('button', { name: 'Mover para esta equipa: Rui Martins' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Remover da equipa: Rui Martins' })).toBeVisible();
  await expect
    .poll(async () => {
      const d = await mgData(page);
      const t = d.teams.find((x) => x.name === 'Pessoas & PMO')!;
      const dev = d.teams.find((x) => x.name.startsWith('Desenvolvimento'))! as {
        lead?: string;
      } & Mg['teams'][number];
      return [
        t.desc,
        d.people.find((p) => p.name === 'Zé Novo')?.team === t.id,
        d.people.find((p) => p.name === 'Rui Martins')?.team === t.id,
        dev.lead,
      ];
    })
    .toEqual(['Equipa de pessoas e PMO.', true, true, '']);
});

test('skills, people and clients', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-skills');
  const cell = page.getByRole('button', { name: 'Zé Novo · BTP', exact: true });
  await cell.click();
  await expect(page.getByRole('button', { name: 'Zé Novo · BTP · Júnior' })).toBeVisible();
  await expect
    .poll(async () => (await mgData(page)).people.find((p) => p.name === 'Zé Novo')?.skills.btp)
    .toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Zé Novo · BTP · Júnior' })).toBeVisible();

  // people: the row opens the profile
  await page.getByRole('rowheader', { name: /Zé Novo/ }).click();
  await expect(page).toHaveURL(/mg-people\?p=/);
  await expect(page.getByLabel('Função', { exact: true })).toHaveValue('Developer ABAP');
  // status, reason, hiring date and years of experience
  await page.getByLabel('Data de contratação').fill('2021-03-15');
  await page.getByLabel('Anos de experiência').fill('6');
  await expect
    .poll(async () => {
      const z = (await mgData(page)).people.find((p) => p.name === 'Zé Novo')!;
      return [z.status, z.hired, z.expYears];
    })
    .toEqual(['Ativo', '2021-03-15', 6]);
  // phone with the email; the 6 years broken down by area
  await page.getByLabel('Telefone').fill('+351 912 000 111');
  const exp = page.getByRole('group', { name: 'Repartição da experiência' });
  await exp.getByRole('button', { name: '+ Especificar por área' }).click();
  for (const [a, y] of [
    ['ABAP', '4'],
    ['Gestão de projeto', '1'],
  ] as const) {
    await exp.getByLabel('Área', { exact: true }).fill(a);
    await exp.getByLabel('Anos', { exact: true }).fill(y);
    await exp.getByLabel('Anos', { exact: true }).press('Enter');
  }
  await expect(exp).toContainText('1 ano por especificar');
  await exp.getByLabel('Anos em ABAP').fill('6');
  await expect(exp).toContainText('7 de 6 anos — excede');
  await exp.getByRole('button', { name: 'Remover Gestão de projeto' }).click();
  await expect(exp).toContainText('Tudo especificado');
  await expect
    .poll(async () => {
      const z = (await mgData(page)).people.find((p) => p.name === 'Zé Novo')!;
      return [z.phone, z.expSplit];
    })
    .toEqual(['+351 912 000 111', [{ area: 'ABAP', years: 6 }]]);
  await page.goto('app/mg-people');
  await page
    .getByRole('button', { name: /Rui Martins/ })
    .first()
    .click();
  await page.getByLabel('Estado', { exact: true }).selectOption('Suspenso');
  await page.getByLabel('Motivo / observações').fill('Baixa médica até 30/11');
  await expect(
    page
      .locator('span', { hasText: /^Suspenso$/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Motivo / observações')).toHaveValue('Baixa médica até 30/11');
  // the list filters by status
  await page.getByLabel('Filtrar por estado').selectOption('Suspenso');
  await expect(page.getByText('1 pessoas')).toBeVisible();

  // clients: a new client with a name
  await page.goto('app/mg-clients');
  await page.getByRole('button', { name: 'Novo Cliente' }).click();
  await page.getByLabel('Nome').fill('Cliente E2E');
  await page.getByLabel('Setor').fill('Testes');
  await expect
    .poll(async () => (await mgData(page)).clients.some((c) => c.name === 'Cliente E2E'))
    .toBe(true);
});

test('projects: new project with a new client, phases', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-projects');
  await page.getByRole('button', { name: 'Novo Projeto' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo Projeto' });
  await dlg.getByRole('button', { name: 'Criar Projeto' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('Indique o nome do projeto.');
  await dlg.getByLabel('Código').fill('e2e-01');
  await expect(dlg.getByLabel('Código')).toHaveValue('E2E-01');
  await dlg.getByLabel('Nome', { exact: true }).fill('Projeto E2E');
  await dlg.getByRole('tab', { name: 'Novo Cliente' }).click();
  await dlg.getByLabel('Nome do cliente').fill('Cliente Projeto E2E');
  await dlg.getByRole('button', { name: 'Criar Projeto' }).click();
  await expect(dlg).toBeHidden();
  await expect(page).toHaveURL(/mg-projects\?pj=/);
  await expect(page.getByRole('button', { name: 'Cliente Projeto E2E →' })).toBeVisible();
  await page.getByRole('button', { name: '+ Fase' }).click();
  await expect(page.getByLabel('Fases 3')).toHaveValue('Nova Fase');
  await expect
    .poll(async () => {
      const d = await mgData(page);
      const p = d.projects.find((x) => x.code === 'E2E-01');
      return [p?.name, d.clients.some((c) => c.name === 'Cliente Projeto E2E'), p?.phases.length];
    })
    .toEqual(['Projeto E2E', true, 3]);
});

test('allocations: new allocation from the panel, weekly override, dashboard and overview', async ({
  page,
}) => {
  await login(page);
  await page.goto('app/mg-alloc');
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await page.getByRole('button', { name: '+ Alocação' }).click();
  const panel = page.getByRole('complementary', { name: 'Nova Alocação' });
  // name · cargo; suspended people are not offered for new allocations
  await expect(panel.getByLabel('Recurso').locator('option', { hasText: 'Rui Martins' })).toHaveCount(0);
  await panel.getByLabel('Recurso').selectOption({ label: 'Zé Novo · Developer ABAP' });
  await panel.getByLabel('Projeto', { exact: true }).selectOption({ label: 'E2E-01 · Projeto E2E' });
  // role in the project: the person's skills as suggestions, or free text
  await panel
    .getByRole('group', { name: 'Competências da pessoa' })
    .getByRole('button', { name: /^ABAP/ })
    .click();
  await expect(panel.getByLabel('Função no projeto')).toHaveValue('ABAP');
  await panel.getByLabel('Função no projeto').fill('Programador ABAP sénior');
  await panel.getByLabel('Horas por dia').fill('4');
  await panel.getByLabel('Número de dias úteis').fill('10');
  await panel.getByRole('button', { name: 'Sex' }).click();
  await expect(panel.getByText('16h', { exact: true })).toBeVisible(); // per week: 4 days × 4h
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel).toBeHidden();
  const alloc = async () => {
    const d = await mgData(page);
    const pid = d.people.find((p) => p.name === 'Zé Novo')!.id;
    const pj = d.projects.find((p) => p.code === 'E2E-01')!.id;
    return d.allocs.find((a) => a.person === pid && a.project === pj);
  };
  await expect.poll(async () => (await alloc())?.hours).toBe(16);
  expect((await alloc())!.fn).toBe('Programador ABAP sénior');
  expect(Object.values((await alloc())!.dov!).filter((h) => h === 4)).toHaveLength(10);

  // weekly grid: override one week from the cell popover
  await page.getByRole('tab', { name: 'Grelha Semanal' }).click();
  await page.getByLabel('Filtrar pessoas…').fill('Zé Novo');
  const cell = page.getByRole('button', { name: /^Zé Novo · .* · 16h$/ }).first();
  await cell.click();
  const pop = page.getByRole('dialog', { name: 'Zé Novo' });
  await pop.getByLabel(/E2E-01/).fill('8');
  await expect.poll(async () => Object.values((await alloc())!.ovr ?? {})).toContain(8);
  await page.mouse.click(5, 5);

  // dashboard: the band card filters; overview: KPI opens the weekly grid
  await page.goto('app/mg-dash');
  await page.getByRole('button', { name: /Acima da Alocação/ }).click();
  await expect(page.getByRole('button', { name: /Acima da Alocação/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
  await page.goto('app/mg-overview');
  await page
    .getByRole('button', { name: /Sobre-alocados/ })
    .first()
    .click();
  await expect(page).toHaveURL(/mg-alloc\?mode=heat/);
  await expect(page.getByRole('tab', { name: 'Grelha Semanal' })).toHaveAttribute('aria-selected', 'true');
});

test('resource finder: new search, profile, assign; timesheets; project on a task', async ({ page }) => {
  await login(page);
  await page.goto('app/mg-staff');
  await page.getByRole('button', { name: 'Nova Pesquisa' }).click();
  await expect(page).toHaveURL(/mg-staff\?.*r=/);
  await page.getByLabel('Competências 1').selectOption('btp');
  await page.getByLabel('Projeto', { exact: true }).selectOption({ label: 'LUS-S4 · Migração S/4HANA' });
  await page.getByLabel('Horas por semana').fill('4');
  // Zé Novo has BTP Júnior (skills test): any level matches
  const assign = page.getByRole('button', { name: 'Alocar: Zé Novo' });
  await expect(assign).toBeVisible();
  await assign.click();
  await expect(page.getByText('✓ Alocado')).toBeVisible();
  await expect
    .poll(async () => {
      const d = await mgData(page);
      const zid = d.people.find((p) => p.name === 'Zé Novo')!.id;
      const r = d.reqs.find((x) => x.skills[0]?.k === 'btp' && x.assigned === zid);
      return r?.status;
    })
    .toBe('Preenchido');

  // timesheets: Zé Novo has allocations, logs hours and submits
  await page.goto('app/mg-time');
  await page.getByRole('tab', { name: 'Por Pessoa' }).click();
  await page.getByRole('button', { name: 'Semana Seguinte' }).click(); // this week (Zé Novo is allocated)
  await page.getByRole('button', { name: /Zé Novo/ }).click();
  const cell = page.getByLabel(/^E2E-01 · /).first();
  await cell.fill('3.5');
  await page.getByRole('button', { name: 'Submeter Semana' }).click();
  await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible();
  await expect(cell).toBeDisabled();
  await expect
    .poll(async () => {
      const d = await mgData(page);
      const zid = d.people.find((p) => p.name === 'Zé Novo')!.id;
      return d.ts
        .filter((x) => x.person === zid)
        .map((x) => [x.status, Object.values(x.rows).flat().includes(3.5)]);
    })
    .toContainEqual(['Submetido', true]);

  // "Por Equipa" groups by the real teams
  await page.getByRole('tab', { name: 'Por Equipa' }).click();
  await expect(page.getByRole('row', { name: /Desenvolvimento & Tecnologia/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Pessoas & PMO/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Por Pessoa' }).click();

  // tasks: the project select lists the Management projects
  await page.goto('app/tasks');
  await page
    .getByRole('button', { name: /Nova Tarefa|Nova tarefa/ })
    .first()
    .click();
  const sel = page.locator('label', { hasText: 'Projeto' }).locator('select');
  await sel.selectOption({ label: 'E2E-01 · Projeto E2E' });
  await expect(sel).toHaveValue(/[0-9a-f-]{36}/);
});
