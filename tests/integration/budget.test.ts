import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import ExcelJS from 'exceljs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Orçamentos through the real services, as kh_app under RLS: the matrix, the
// Excel model and the budgets are each person's own.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.29', userAgent: 'vitest', lang: 'pt' as const };
describe.skipIf(!enabled)('budgets', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let bg: typeof import('@/server/budget');
  let ws: typeof import('@/server/workspaces');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, bg, ws, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/budget'),
      import('@/server/workspaces'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE budgets, budget_settings, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
  });

  afterAll(async () => {
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function signedIn(email: string, password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await svc.register({ name: email.split('@')[0]!, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }

  async function model() {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet('Orçamento');
    s.getCell('A1').value = 'Cliente';
    s.getCell('A2').value = 'REF';
    ['#', 'Descrição', 'Tipo de Recurso', '# Recurso', 'Custo Unit.'].forEach(
      (v, i) => (s.getRow(5).getCell(i + 1).value = v),
    );
    s.getCell('A6').value = 'Serviços';
    s.getCell('A9').value = 'Sub-Total';
    s.getCell('F9').value = { formula: 'SUM(F7:F8)', result: 0 };
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it('is in the plans; the matrix starts with the SF modules; a budget is made from it and fills the model', async () => {
    const ana = await signedIn('ana@bg.pt');
    expect((await ws.entitlementsFor(ana)).modules).toContain('mg_budget');
    const s = await bg.getSettings(ana);
    expect(s.matrix.modules.map((m) => m.code)).toContain('ECP');
    expect(s.template).toBeNull();
    const m = structuredClone(s.matrix);
    m.modules.find((x) => x.code === 'EC')!.days = {
      CONS: { gf: 90, bf: 60, n: 1 },
      GP: { gf: 8, bf: 5, n: 1 },
    };
    await bg.saveMatrix(ana, m as never);
    const b = await bg.createBudget(ana, {
      client: 'Banco Atlântico',
      scenario: 'gf',
      modules: ['EC', 'XX'],
    });
    expect(b.ref).toMatch(/^ORC-\d{4}-001$/);
    expect(b.modules).toEqual(['EC']);
    expect(b.lines.map((l) => [l.desc, l.days])).toEqual([
      ['Consultor SAP SF Employee Central', 90],
      ['Gestor de Projectos', 8],
    ]);
    await expect(bg.budgetXlsx(ana, b.id)).rejects.toMatchObject({ code: 'no_template' });
    const set = await bg.setTemplate(ana, 'PL.xlsx', await model());
    expect(set.mapping?.blocks.services).toEqual({ from: 7, to: 8 });
    expect(set.mapping?.fields).toEqual({ client: 'B1', ref: 'B2' });
    const x = await bg.budgetXlsx(ana, b.id);
    expect(x.name).toBe(`Orcamento_Banco_Atlantico_${b.ref}.xlsx`);
    // Brownfield: the lines are made again
    const bf = await bg.updateBudget(ana, b.id, { scenario: 'bf', rebuild: true });
    expect(bf.lines.map((l) => l.days)).toEqual([60, 5]);
    const copy = await bg.duplicateBudget(ana, b.id);
    expect(copy.ref).toMatch(/-002$/);
    await bg.deleteBudget(ana, b.id);
    expect((await bg.listBudgets(ana)).map((x) => x.id)).toEqual([copy.id]);
    await bg.deleteBudget(ana, b.id, true);
    expect(await bg.listBudgets(ana)).toHaveLength(2);
  });

  it('nobody sees another person’s matrix, model or budgets', async () => {
    const ana = await signedIn('ana@bg2.pt');
    const rui = await signedIn('rui@bg2.pt');
    await bg.setTemplate(ana, 'PL.xlsx', await model());
    const b = await bg.createBudget(ana, { client: 'Cliente A', scenario: 'gf', modules: ['EC'] });
    expect(await bg.listBudgets(rui)).toEqual([]);
    await expect(bg.getBudget(rui, b.id)).rejects.toMatchObject({ code: 'not_found' });
    expect((await bg.getSettings(rui)).template).toBeNull();
  });
});
